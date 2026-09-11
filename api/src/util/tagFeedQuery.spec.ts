import {
    applyTagFeedFloor,
    candidateFloor,
    planTagFeed,
    TAG_FEED_DEFAULT_LIMIT,
    TAG_FEED_INDEX,
} from "./tagFeedQuery";
import { MongoQueryDto } from "../dto/MongoQueryDto";

function query(partial: Partial<MongoQueryDto>): MongoQueryDto {
    return { selector: { $and: [] }, ...partial } as MongoQueryDto;
}

describe("tagFeedQuery", () => {
    describe("planTagFeed", () => {
        it("detects an $in tag feed and carries the limit", () => {
            const plan = planTagFeed(
                query({
                    selector: {
                        $and: [
                            { type: "content" },
                            { parentTags: { $elemMatch: { $in: ["t1", "t2"] } } },
                        ],
                    },
                    sort: [{ publishDate: "desc" }],
                    limit: 12,
                } as any),
            );
            expect(plan).toEqual({ tagIds: ["t1", "t2"], limit: 12 });
        });

        it("detects the single-tag $eq form", () => {
            const plan = planTagFeed(
                query({
                    selector: { $and: [{ parentTags: { $elemMatch: { $eq: "t1" } } }] },
                    sort: [{ publishDate: "asc" }],
                } as any),
            );
            expect(plan).toEqual({ tagIds: ["t1"], limit: TAG_FEED_DEFAULT_LIMIT });
        });

        it("ignores a query with no publishDate sort", () => {
            expect(
                planTagFeed(
                    query({
                        selector: { $and: [{ parentTags: { $elemMatch: { $in: ["t1"] } } }] },
                    } as any),
                ),
            ).toBeUndefined();
        });

        it("ignores a sort on another field", () => {
            expect(
                planTagFeed(
                    query({
                        selector: { $and: [{ parentTags: { $elemMatch: { $in: ["t1"] } } }] },
                        sort: [{ title: "asc" }],
                    } as any),
                ),
            ).toBeUndefined();
        });

        it("ignores a query with no parentTags condition", () => {
            expect(
                planTagFeed(
                    query({
                        selector: { $and: [{ parentId: { $in: ["p1"] } }] },
                        sort: [{ publishDate: "desc" }],
                    } as any),
                ),
            ).toBeUndefined();
        });

        it("ignores an empty tag list", () => {
            expect(
                planTagFeed(
                    query({
                        selector: { $and: [{ parentTags: { $elemMatch: { $in: [] } } }] },
                        sort: [{ publishDate: "desc" }],
                    } as any),
                ),
            ).toBeUndefined();
        });

        it("ignores non-string tag ids rather than seeking on them", () => {
            expect(
                planTagFeed(
                    query({
                        selector: { $and: [{ parentTags: { $elemMatch: { $in: ["t1", 7] } } }] },
                        sort: [{ publishDate: "desc" }],
                    } as any),
                ),
            ).toBeUndefined();
        });

        it("declines two parentTags conditions — they AND, which one floor can't express", () => {
            expect(
                planTagFeed(
                    query({
                        selector: {
                            $and: [
                                { parentTags: { $elemMatch: { $in: ["t1"] } } },
                                { parentTags: { $elemMatch: { $in: ["t2"] } } },
                            ],
                        },
                        sort: [{ publishDate: "desc" }],
                    } as any),
                ),
            ).toBeUndefined();
        });
    });

    describe("candidateFloor", () => {
        const c = (...dates: number[]) => dates.map((publishDate) => ({ publishDate }));

        it("returns the limit-th newest date", () => {
            expect(candidateFloor(c(50, 10, 30, 40, 20), 3)).toBe(30);
        });

        it("returns the oldest when there are fewer candidates than the limit", () => {
            expect(candidateFloor(c(50, 30), 10)).toBe(30);
        });

        it("returns undefined with no candidates, so the caller can skip the floor", () => {
            // A cold or lagging view returns no rows. That must not be read as "no content
            // for these tags" — the caller falls through to the unbounded query instead.
            expect(candidateFloor([], 10)).toBeUndefined();
        });

        it("is order-independent", () => {
            expect(candidateFloor(c(10, 20, 30), 2)).toBe(candidateFloor(c(30, 10, 20), 2));
        });
    });

    describe("applyTagFeedFloor", () => {
        it("adds a lower bound only, so newer docs stay eligible", () => {
            const q = query({
                selector: { $and: [{ type: "content" }] },
                sort: [{ publishDate: "desc" }],
            } as any);
            applyTagFeedFloor(q, 1234);

            const added = q.selector.$and.filter((c: any) => c.publishDate);
            expect(added).toEqual([{ publishDate: { $gte: 1234 } }]);
            // No upper bound: a doc published after the view indexed is still returned.
            expect(JSON.stringify(q.selector)).not.toContain("$lte");
        });

        it("leaves existing clauses (including injected permission filters) untouched", () => {
            const permission = { memberOf: { $elemMatch: { $in: ["g1"] } } };
            const q = query({
                selector: { $and: [{ type: "content" }, permission] },
                sort: [{ publishDate: "desc" }],
            } as any);
            applyTagFeedFloor(q, 1);
            expect(q.selector.$and).toContain(permission);
        });

        it("pins the publishDate-led index, the only one that can serve the sort", () => {
            const q = query({
                selector: { $and: [] },
                sort: [{ publishDate: "desc" }],
                use_index: "content-parentId-publishDate-index",
            } as any);
            applyTagFeedFloor(q, 1);
            expect((q as any).use_index).toBe(TAG_FEED_INDEX);
        });

        it("keeps the sort, so ordering still comes from CouchDB", () => {
            const q = query({
                selector: { $and: [] },
                sort: [{ publishDate: "desc" }],
            } as any);
            applyTagFeedFloor(q, 1);
            expect(q.sort).toEqual([{ publishDate: "desc" }]);
        });
    });
});
