import { describe, it, expect, beforeAll } from "vitest";
import {
    decideContentApiQuery,
    planRemoteContentQueries,
    withPublishDateOrFallback,
    FANOUT_MAX_PARENTS,
} from "./queryIntrospection";
import { initConfig, config } from "../../config";
import { OPEN_MIN } from "../../api/sync/utils";
import type { MangoQuery, MangoSelector } from "../MangoQuery/MangoTypes";

/** A content supplement query (as decideContentApiQuery would produce it) with a parentId $in. */
function contentApi(parentIds: string[], opts: { sort?: boolean } = {}): MangoQuery {
    const { sort = true } = opts;
    return {
        selector: {
            $and: [
                { type: "content" },
                { parentId: { $in: parentIds } },
                { parentType: "tag" },
                { status: "published" },
                { publishDate: { $lte: 1000 } },
            ],
        },
        ...(sort ? { $sort: [{ publishDate: "desc" }] } : {}),
        $limit: 50,
        use_index: "content-publishDate-index",
    } as MangoQuery;
}

const parentIdOf = (q: MangoQuery): unknown =>
    ((q.selector as any).$and as any[]).find((c) => "parentId" in c)?.parentId;

describe("planRemoteContentQueries — parentId fan-out", () => {
    it("fans a multi-parent content query into one query per parent", () => {
        const out = planRemoteContentQueries(contentApi(["p1", "p2", "p3"]));
        expect(out).toHaveLength(3);
        expect(out.map(parentIdOf).sort()).toEqual(["p1", "p2", "p3"]);
    });

    it("replaces the $in with a parentId equality and repoints use_index to the parentId index", () => {
        const out = planRemoteContentQueries(contentApi(["p1", "p2"]));
        for (const q of out) {
            // equality, not a { $in } object
            expect(typeof parentIdOf(q)).toBe("string");
            expect(q.use_index).toBe("content-parentId-publishDate-index");
        }
    });

    it("carries $sort and $limit and the other selector clauses unchanged", () => {
        const out = planRemoteContentQueries(contentApi(["p1", "p2"]));
        for (const q of out) {
            expect(q.$sort).toEqual([{ publishDate: "desc" }]);
            expect(q.$limit).toBe(50);
            const and = (q.selector as any).$and as any[];
            expect(and).toContainEqual({ type: "content" });
            expect(and).toContainEqual({ parentType: "tag" });
            expect(and).toContainEqual({ status: "published" });
            expect(and).toContainEqual({ publishDate: { $lte: 1000 } });
        }
    });

    it("does not mutate the input query", () => {
        const api = contentApi(["p1", "p2"]);
        const before = JSON.parse(JSON.stringify(api));
        planRemoteContentQueries(api);
        expect(api).toEqual(before);
    });

    it("repoints a single-element parentId $in to the parentId index (single-parent seek)", () => {
        const out = planRemoteContentQueries(contentApi(["only"]));
        expect(out).toHaveLength(1);
        expect(parentIdOf(out[0])).toBe("only"); // equality, not { $in }
        expect(out[0].use_index).toBe("content-parentId-publishDate-index");
        expect(out[0].$sort).toEqual([{ publishDate: "desc" }]);
        expect(out[0].$limit).toBe(50);
    });

    it("does NOT fan out an empty parentId $in (provably-empty guard)", () => {
        const api = contentApi([]);
        expect(planRemoteContentQueries(api)).toEqual([api]);
    });

    it("synthesizes publishDate desc when the source has no $sort", () => {
        const out = planRemoteContentQueries(contentApi(["solo"], { sort: false }));
        expect(out).toHaveLength(1);
        expect(out[0].$sort).toEqual([{ publishDate: "desc" }]);
        expect(out[0].use_index).toBe("content-parentId-publishDate-index");
    });

    it("carries an existing $sort unchanged rather than overriding it", () => {
        const api = contentApi(["solo"]);
        api.$sort = [{ publishDate: "asc" }];
        const out = planRemoteContentQueries(api);
        expect(out[0].$sort).toEqual([{ publishDate: "asc" }]);
    });

    it("passes through a content query with no parentId $in", () => {
        const api: MangoQuery = {
            selector: { $and: [{ type: "content" }, { publishDate: { $lte: 1000 } }] },
        } as MangoQuery;
        expect(planRemoteContentQueries(api)).toEqual([api]);
    });

    it("passes through when more than the cap parents are requested (avoids a request storm)", () => {
        const many = Array.from({ length: FANOUT_MAX_PARENTS + 1 }, (_, i) => "p" + i);
        const api = contentApi(many);
        expect(planRemoteContentQueries(api)).toEqual([api]);
    });

    it("fans out at exactly the cap", () => {
        const atCap = Array.from({ length: FANOUT_MAX_PARENTS }, (_, i) => "p" + i);
        expect(planRemoteContentQueries(contentApi(atCap))).toHaveLength(FANOUT_MAX_PARENTS);
    });

    it("does NOT fan out a non-content query (content gate)", () => {
        const api: MangoQuery = {
            selector: { $and: [{ type: "post" }, { parentId: { $in: ["p1", "p2"] } }] },
        } as MangoQuery;
        expect(planRemoteContentQueries(api)).toEqual([api]);
    });

    it("does NOT fan out a typeless query (no resolved content type)", () => {
        const api: MangoQuery = {
            selector: { $and: [{ parentId: { $in: ["p1", "p2"] } }] },
        } as MangoQuery;
        expect(planRemoteContentQueries(api)).toEqual([api]);
    });

    it("deduplicates repeated parent ids (no redundant per-parent query)", () => {
        const out = planRemoteContentQueries(contentApi(["p1", "p2", "p1"]));
        expect(out).toHaveLength(2);
        expect(out.map(parentIdOf).sort()).toEqual(["p1", "p2"]);
    });

    it("dedups to a single unique parent and repoints it", () => {
        const out = planRemoteContentQueries(contentApi(["p1", "p1"]));
        expect(out).toHaveLength(1);
        expect(parentIdOf(out[0])).toBe("p1");
        expect(out[0].use_index).toBe("content-parentId-publishDate-index");
    });

    it("handles type expressed as { $eq: 'content' }", () => {
        const api: MangoQuery = {
            selector: { $and: [{ type: { $eq: "content" } }, { parentId: { $in: ["p1", "p2"] } }] },
        } as MangoQuery;
        expect(planRemoteContentQueries(api)).toHaveLength(2);
    });
});

describe("withPublishDateOrFallback", () => {
    it("appends a combined $or of the older-tail cutoff and the language $nin", () => {
        const out = withPublishDateOrFallback({ $and: [{ type: "content" }] }, 1000, [
            "lang-en",
            "lang-fr",
        ]);
        const and = (out as { $and: MangoSelector[] }).$and;
        expect(and).toContainEqual({ type: "content" });
        expect(and).toContainEqual({
            $or: [
                { publishDate: { $lte: 1000 } },
                { language: { $nin: ["lang-en", "lang-fr"] } },
            ],
        });
    });
});

describe("decideContentApiQuery — fallback fold-in (FU-1: one combined supplement)", () => {
    beforeAll(() =>
        initConfig({ cms: false, docsIndex: "", apiUrl: "", contentPublishDateCutoff: 1000 }),
    );

    const feed = (over: Partial<MangoQuery> = {}): MangoQuery =>
        ({
            selector: { $and: [{ type: "content" }, { status: "published" }] },
            $sort: [{ publishDate: "desc" }],
            $limit: 20,
            use_index: "content-publishDate-index",
            ...over,
        }) as MangoQuery;

    const orClause = (q: MangoQuery | undefined): unknown =>
        q &&
        (q.selector as { $and: MangoSelector[] }).$and.find(
            (c) => (c as Record<string, unknown>).$or,
        );
    const hasNin = (q: MangoQuery | undefined): boolean =>
        !!JSON.stringify(q?.selector ?? {}).includes('"$nin"');

    it("without fallback langs, appends only publishDate <= cutoff (unchanged)", () => {
        const out = decideContentApiQuery(feed(), []);
        expect(hasNin(out)).toBe(false);
        expect(
            (out!.selector as { $and: MangoSelector[] }).$and,
        ).toContainEqual({ publishDate: { $lte: 1000 } });
    });

    it("an empty fallback list is treated as no fallback", () => {
        expect(hasNin(decideContentApiQuery(feed(), []))).toBe(false);
    });

    it("with fallback langs, appends ONE combined $or[publishDate<=cutoff, language $nin]", () => {
        const out = decideContentApiQuery(feed(), [], ["lang-en", "lang-fr"]);
        expect(orClause(out)).toEqual({
            $or: [
                { publishDate: { $lte: 1000 } },
                { language: { $nin: ["lang-en", "lang-fr"] } },
            ],
        });
        // full $limit (not a shortfall) so a fallback post can out-rank a local one
        expect(out!.$limit).toBe(20);
    });

    it("with fallback, still POSTs even when the local page is already full", () => {
        const full = Array.from({ length: 20 }, (_v, i) => ({ _id: `d${i}` })) as any[];
        // without fallback → undefined (local satisfies); with fallback → still a query
        expect(decideContentApiQuery(feed(), full)).toBeUndefined();
        expect(decideContentApiQuery(feed(), full, ["lang-en"])).toBeDefined();
    });

    it("with fallback, fires even at OPEN_MIN (no cutoff); without, it does not", () => {
        config.contentPublishDateCutoff = OPEN_MIN;
        expect(decideContentApiQuery(feed(), [])).toBeUndefined();
        expect(hasNin(decideContentApiQuery(feed(), [], ["lang-en"]))).toBe(true);
        config.contentPublishDateCutoff = 1000;
    });
});
