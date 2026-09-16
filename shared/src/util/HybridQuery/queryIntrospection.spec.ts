import { describe, it, expect, beforeAll } from "vitest";
import {
    decideContentApiQuery,
    planRemoteContentQueries,
    FANOUT_MAX_PARENTS,
} from "./queryIntrospection";
import { MAX_TIE_EXCLUSIONS } from "./queryPlanner";
import { mangoCompile } from "../MangoQuery/mangoCompile";
import { initConfig, config } from "../../config";
import { OPEN_MIN } from "../../api/sync/utils";
import type { MangoQuery, MangoSelector } from "../MangoQuery/MangoTypes";

/** Below-cutoff tail appended by `withPublishDate` on content API supplements. */
const publishDateTail = (cutoff: number) => ({
    $or: [{ publishDate: { $lte: cutoff } }, { parentAlwaysOffline: true }],
});

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

describe("decideContentApiQuery — older-tail supplement", () => {
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

    it("appends the below-cutoff/always-offline tail to the supplement selector", () => {
        const out = decideContentApiQuery(feed(), []);
        expect((out!.selector as { $and: MangoSelector[] }).$and).toContainEqual(
            publishDateTail(1000),
        );
    });

    it("fetches only the shortfall (limit − local) when the local page is partial", () => {
        const local = Array.from({ length: 5 }, (_v, i) => ({ _id: `d${i}` })) as any[];
        expect(decideContentApiQuery(feed(), local)!.$limit).toBe(15);
    });

    it("returns undefined when the local page is already full", () => {
        const full = Array.from({ length: 20 }, (_v, i) => ({ _id: `d${i}` })) as any[];
        expect(decideContentApiQuery(feed(), full)).toBeUndefined();
    });

    it("returns undefined at OPEN_MIN (full-corpus sync — nothing to supplement)", () => {
        config.contentPublishDateCutoff = OPEN_MIN;
        expect(decideContentApiQuery(feed(), [])).toBeUndefined();
        config.contentPublishDateCutoff = 1000;
    });

    describe("paging past the rows already held", () => {
        const tail = (count: number, publishDate: (i: number) => number, prefix = "r") =>
            Array.from({ length: count }, (_v, i) => ({
                _id: `${prefix}${i}`,
                publishDate: publishDate(i),
            })) as any[];

        it("narrows past the oldest held row and asks only for the shortfall", () => {
            const local = tail(5, () => 5000, "l");
            const held = tail(10, (i) => 900 - i);
            const out = decideContentApiQuery(feed(), local, held)!;

            expect(out.$limit).toBe(5); // 20 requested − 15 distinct already held
            // Assert the clause's SHAPE, not its spelling: a boundary ANDed instead of
            // ORed with its tie group would still contain both fragments as substrings.
            expect((out.selector as any).$and).toContainEqual({
                $or: [
                    { publishDate: { $lt: 891 } },
                    { $and: [{ publishDate: 891 }, { _id: { $nin: ["r9"] } }] },
                ],
            });
        });

        // The selector is only as good as what it actually admits, so compile it and
        // check membership. Spelling assertions above can't catch an inverted operator.
        describe("the narrowed selector admits exactly the unseen rows", () => {
            const held = [
                { _id: "r0", publishDate: 900 },
                { _id: "r1", publishDate: 891 },
                { _id: "r2", publishDate: 891 },
            ] as any[];
            const matches = (doc: Record<string, unknown>) =>
                mangoCompile(decideContentApiQuery(feed(), [], held)!.selector)({
                    type: "content",
                    status: "published",
                    ...doc,
                });

            it("excludes a held row sitting on the boundary", () => {
                expect(matches({ _id: "r2", publishDate: 891 })).toBe(false);
            });

            it("ADMITS an unseen row sharing the boundary value", () => {
                // The whole reason ties are excluded by id: a bare `$lt` would drop this
                // row forever, silently losing every doc published at the same instant.
                expect(matches({ _id: "unseen", publishDate: 891 })).toBe(true);
            });

            it("admits a row past the boundary", () => {
                expect(matches({ _id: "older", publishDate: 500 })).toBe(true);
            });

            it("excludes a row above the boundary, already covered by an earlier page", () => {
                expect(matches({ _id: "newer", publishDate: 950 })).toBe(false);
            });

            it("still excludes rows above the cutoff", () => {
                expect(matches({ _id: "fresh", publishDate: 5000 })).toBe(false);
            });
        });

        it("counts a doc supplied by BOTH sources once against the limit", () => {
            const shared = [{ _id: "dup", publishDate: 900 }] as any[];
            const out = decideContentApiQuery(feed(), shared, shared)!;
            // Union is one doc, not two — a double count would under-fetch and strand paging.
            expect(out.$limit).toBe(19);
        });

        it("returns undefined once the union of both sources fills the page", () => {
            const local = tail(12, () => 5000, "l");
            const held = tail(8, (i) => 900 - i);
            expect(decideContentApiQuery(feed(), local, held)).toBeUndefined();
        });

        it("walks the sort field, not publishDate, when they differ", () => {
            const query = feed({ $sort: [{ title: "asc" }] });
            const held = [{ _id: "r0", title: "alpha" }] as any[];
            expect(JSON.stringify(decideContentApiQuery(query, [], held)!.selector)).toContain(
                '"$gt":"alpha"',
            );
        });

        it("falls back to the un-narrowed tail when the tie group is too large", () => {
            const held = tail(MAX_TIE_EXCLUSIONS + 1, () => 900);
            const out = decideContentApiQuery(feed({ $limit: 100 }), [], held)!;
            expect(JSON.stringify(out.selector)).not.toContain("$nin");
            // Un-narrowed it re-supplies the held rows, so they must fit under the limit.
            expect(out.$limit).toBe(100);
        });

        it("falls back when the sort has no single comparable key", () => {
            for (const $sort of [undefined, [{ a: "asc" }, { b: "asc" }]]) {
                const held = tail(1, () => 900);
                const out = decideContentApiQuery(
                    feed({ $sort } as Partial<MangoQuery>),
                    [],
                    held,
                )!;
                expect(JSON.stringify(out.selector)).not.toContain("$nin");
            }
        });

        it("falls back when any held row has no comparable value for the sort field", () => {
            // Both orderings: a missing value AFTER the boundary is caught by the type
            // compare, but one BEFORE it would otherwise seed a boundary that silently
            // ignores that row. Non-comparable types have no ordering at all.
            const unusable = [
                [{ _id: "r0", publishDate: 900 }, { _id: "r1" }],
                [{ _id: "r0" }, { _id: "r1", publishDate: 900 }],
                [{ _id: "r0", publishDate: true }],
                [{ _id: "r0", publishDate: null }],
                [{ _id: "r0", publishDate: { nested: 1 } }],
            ] as any[][];
            for (const held of unusable) {
                expect(
                    JSON.stringify(decideContentApiQuery(feed(), [], held)!.selector),
                ).not.toContain("$nin");
            }
        });

        it("is the plain below-cutoff tail on the first page, where nothing is held yet", () => {
            const local = tail(5, () => 5000, "l");
            expect(decideContentApiQuery(feed(), local, [])).toEqual({
                selector: {
                    $and: [{ type: "content" }, { status: "published" }, publishDateTail(1000)],
                },
                $sort: [{ publishDate: "desc" }],
                $limit: 15,
                use_index: "content-publishDate-index",
            });
        });
    });
});
