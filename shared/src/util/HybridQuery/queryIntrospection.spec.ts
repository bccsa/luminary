import { describe, it, expect } from "vitest";
import { planRemoteContentQueries, FANOUT_MAX_PARENTS } from "./queryIntrospection";
import type { MangoQuery } from "../MangoQuery/MangoTypes";

/** A content supplement query (as decideContentApiQuery would produce it) with a parentId $in. */
function contentApi(parentIds: string[]): MangoQuery {
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
        $sort: [{ publishDate: "desc" }],
        $limit: 50,
        use_index: "content-publishDate-index",
    } as MangoQuery;
}

const parentIdOf = (q: MangoQuery): unknown =>
    ((q.selector as any).$and as any[]).find((c) => "parentId" in c)?.parentId;

describe("planRemoteContentQueries", () => {
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

    it("passes through a single-element $in (nothing to fan out)", () => {
        const api = contentApi(["only"]);
        const out = planRemoteContentQueries(api);
        expect(out).toEqual([api]);
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

    it("does not fan out when duplicates collapse to a single unique parent", () => {
        const api = contentApi(["p1", "p1"]);
        expect(planRemoteContentQueries(api)).toEqual([api]);
    });

    it("handles type expressed as { $eq: 'content' }", () => {
        const api: MangoQuery = {
            selector: { $and: [{ type: { $eq: "content" } }, { parentId: { $in: ["p1", "p2"] } }] },
        } as MangoQuery;
        expect(planRemoteContentQueries(api)).toHaveLength(2);
    });
});
