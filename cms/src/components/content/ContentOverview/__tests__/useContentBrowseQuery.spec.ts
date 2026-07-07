import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { effectScope, nextTick, ref, type Ref } from "vue";
import { db, DocType, PostType, PublishStatus, type ContentDto } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { sessionNow } from "@/util/sessionNow";
import { useContentBrowseQuery } from "../useContentBrowseQuery";
import type { ContentOverviewQueryOptions } from "../types";

function contentDoc(over: Partial<ContentDto> & { _id: string }): ContentDto {
    return {
        type: DocType.Content,
        parentId: `${over._id}-parent`,
        parentType: DocType.Post,
        parentPostType: PostType.Blog,
        updatedTimeUtc: 1000,
        memberOf: ["group-1"],
        parentTags: [],
        language: "lang-eng",
        availableTranslations: ["lang-eng"],
        status: PublishStatus.Published,
        slug: over._id,
        title: "Untitled",
        author: "",
        summary: "",
        text: "",
        publishDate: 1,
        ...over,
    } as ContentDto;
}

function baseOptions(over: Partial<ContentOverviewQueryOptions> = {}): ContentOverviewQueryOptions {
    return {
        languageId: "lang-eng",
        parentType: DocType.Post,
        tagOrPostType: PostType.Blog,
        translationStatus: "all",
        publishStatus: "all",
        orderBy: "updatedTimeUtc",
        orderDirection: "desc",
        tags: [],
        groups: [],
        ...over,
    };
}

async function run(options: ContentOverviewQueryOptions, limit: Ref<number> = ref(20)) {
    const scope = effectScope();
    let api!: ReturnType<typeof useContentBrowseQuery>;
    scope.run(() => {
        api = useContentBrowseQuery(() => options, limit);
    });
    await nextTick();
    return { api, scope };
}

describe("useContentBrowseQuery", () => {
    beforeEach(async () => {
        await db.docs.clear();
    });

    describe("filtering", () => {
        it("filters by tag ($elemMatch on parentTags)", async () => {
            await db.bulkPut([
                contentDoc({ _id: "with-tag", parentTags: ["tag-a"] }),
                contentDoc({ _id: "without-tag", parentTags: ["tag-b"] }),
            ]);

            const { api, scope } = await run(baseOptions({ tags: ["tag-a"] }));
            await waitForExpect(() => {
                expect(api.docs.value.map((d) => d._id)).toEqual(["with-tag"]);
            });
            scope.stop();
        });

        it("filters by group ($elemMatch on memberOf)", async () => {
            await db.bulkPut([
                contentDoc({ _id: "in-group", memberOf: ["group-a"] }),
                contentDoc({ _id: "out-of-group", memberOf: ["group-b"] }),
            ]);

            const { api, scope } = await run(baseOptions({ groups: ["group-a"] }));
            await waitForExpect(() => {
                expect(api.docs.value.map((d) => d._id)).toEqual(["in-group"]);
            });
            scope.stop();
        });

        it("filters by translation status 'translated' (exact language match)", async () => {
            await db.bulkPut([
                contentDoc({ _id: "in-lang", language: "lang-eng" }),
                contentDoc({ _id: "other-lang", language: "lang-fra" }),
            ]);

            const { api, scope } = await run(baseOptions({ translationStatus: "translated" }));
            await waitForExpect(() => {
                expect(api.docs.value.map((d) => d._id)).toEqual(["in-lang"]);
            });
            scope.stop();
        });

        it("filters by publish status 'published' (status + publishDate + non-expired window)", async () => {
            const now = sessionNow();
            await db.bulkPut([
                contentDoc({
                    _id: "live",
                    status: PublishStatus.Published,
                    publishDate: now - 1000,
                }),
                contentDoc({ _id: "draft", status: PublishStatus.Draft, publishDate: now - 1000 }),
                contentDoc({
                    _id: "scheduled",
                    status: PublishStatus.Published,
                    publishDate: now + 1000,
                }),
                contentDoc({
                    _id: "expired",
                    status: PublishStatus.Published,
                    publishDate: now - 2000,
                    expiryDate: now - 1000,
                }),
            ]);

            const { api, scope } = await run(baseOptions({ publishStatus: "published" }));
            await waitForExpect(() => {
                expect(api.docs.value.map((d) => d._id)).toEqual(["live"]);
            });
            scope.stop();
        });

        it("filters by publish status 'scheduled' (future publishDate)", async () => {
            const now = sessionNow();
            await db.bulkPut([
                contentDoc({
                    _id: "live",
                    status: PublishStatus.Published,
                    publishDate: now - 1000,
                }),
                contentDoc({
                    _id: "scheduled",
                    status: PublishStatus.Published,
                    publishDate: now + 1000,
                }),
            ]);

            const { api, scope } = await run(baseOptions({ publishStatus: "scheduled" }));
            await waitForExpect(() => {
                expect(api.docs.value.map((d) => d._id)).toEqual(["scheduled"]);
            });
            scope.stop();
        });

        it("filters by publish status 'expired' (past expiryDate)", async () => {
            const now = sessionNow();
            await db.bulkPut([
                contentDoc({
                    _id: "live",
                    status: PublishStatus.Published,
                    publishDate: now - 1000,
                }),
                contentDoc({
                    _id: "expired",
                    status: PublishStatus.Published,
                    publishDate: now - 2000,
                    expiryDate: now - 1000,
                }),
            ]);

            const { api, scope } = await run(baseOptions({ publishStatus: "expired" }));
            await waitForExpect(() => {
                expect(api.docs.value.map((d) => d._id)).toEqual(["expired"]);
            });
            scope.stop();
        });

        it("filters by publish status 'draft'", async () => {
            await db.bulkPut([
                contentDoc({ _id: "draft", status: PublishStatus.Draft }),
                contentDoc({ _id: "live", status: PublishStatus.Published }),
            ]);

            const { api, scope } = await run(baseOptions({ publishStatus: "draft" }));
            await waitForExpect(() => {
                expect(api.docs.value.map((d) => d._id)).toEqual(["draft"]);
            });
            scope.stop();
        });

        it("filters by publishedAfter/publishedBefore range", async () => {
            await db.bulkPut([
                contentDoc({ _id: "in-range", publishDate: 500 }),
                contentDoc({ _id: "too-early", publishDate: 100 }),
                contentDoc({ _id: "too-late", publishDate: 900 }),
            ]);

            const { api, scope } = await run(
                baseOptions({ publishedAfter: 400, publishedBefore: 600 }),
            );
            await waitForExpect(() => {
                expect(api.docs.value.map((d) => d._id)).toEqual(["in-range"]);
            });
            scope.stop();
        });

        it("filters by expiresAfter/expiresBefore range", async () => {
            await db.bulkPut([
                contentDoc({ _id: "in-range", expiryDate: 500 }),
                contentDoc({ _id: "too-early", expiryDate: 100 }),
                contentDoc({ _id: "too-late", expiryDate: 900 }),
            ]);

            const { api, scope } = await run(
                baseOptions({ expiresAfter: 400, expiresBefore: 600 }),
            );
            await waitForExpect(() => {
                expect(api.docs.value.map((d) => d._id)).toEqual(["in-range"]);
            });
            scope.stop();
        });

        it("combines tag + group + publish-status filters (AND, not OR)", async () => {
            await db.bulkPut([
                contentDoc({
                    _id: "matches-all",
                    parentTags: ["tag-a"],
                    memberOf: ["group-a"],
                    status: PublishStatus.Published,
                }),
                contentDoc({
                    _id: "wrong-tag",
                    parentTags: ["tag-b"],
                    memberOf: ["group-a"],
                    status: PublishStatus.Published,
                }),
                contentDoc({
                    _id: "wrong-group",
                    parentTags: ["tag-a"],
                    memberOf: ["group-b"],
                    status: PublishStatus.Published,
                }),
                contentDoc({
                    _id: "wrong-status",
                    parentTags: ["tag-a"],
                    memberOf: ["group-a"],
                    status: PublishStatus.Draft,
                }),
            ]);

            const { api, scope } = await run(
                baseOptions({ tags: ["tag-a"], groups: ["group-a"], publishStatus: "draft" }),
            );
            await waitForExpect(() => {
                expect(api.docs.value.map((d) => d._id)).toEqual(["wrong-status"]);
            });
            scope.stop();
        });
    });

    describe("sorting", () => {
        it("sorts by title ascending", async () => {
            await db.bulkPut([
                contentDoc({ _id: "c", title: "Charlie" }),
                contentDoc({ _id: "a", title: "Alpha" }),
                contentDoc({ _id: "b", title: "Bravo" }),
            ]);

            const { api, scope } = await run(
                baseOptions({ orderBy: "title", orderDirection: "asc" }),
            );
            await waitForExpect(() => {
                expect(api.docs.value.map((d) => d._id)).toEqual(["a", "b", "c"]);
            });
            scope.stop();
        });

        it("sorts by title descending", async () => {
            await db.bulkPut([
                contentDoc({ _id: "c", title: "Charlie" }),
                contentDoc({ _id: "a", title: "Alpha" }),
                contentDoc({ _id: "b", title: "Bravo" }),
            ]);

            const { api, scope } = await run(
                baseOptions({ orderBy: "title", orderDirection: "desc" }),
            );
            await waitForExpect(() => {
                expect(api.docs.value.map((d) => d._id)).toEqual(["c", "b", "a"]);
            });
            scope.stop();
        });

        it("sorts by updatedTimeUtc (default field) ascending and descending", async () => {
            await db.bulkPut([
                contentDoc({ _id: "old", updatedTimeUtc: 100 }),
                contentDoc({ _id: "new", updatedTimeUtc: 300 }),
                contentDoc({ _id: "mid", updatedTimeUtc: 200 }),
            ]);

            const asc = await run(baseOptions({ orderBy: "updatedTimeUtc", orderDirection: "asc" }));
            await waitForExpect(() => {
                expect(asc.api.docs.value.map((d) => d._id)).toEqual(["old", "mid", "new"]);
            });
            asc.scope.stop();

            const desc = await run(
                baseOptions({ orderBy: "updatedTimeUtc", orderDirection: "desc" }),
            );
            await waitForExpect(() => {
                expect(desc.api.docs.value.map((d) => d._id)).toEqual(["new", "mid", "old"]);
            });
            desc.scope.stop();
        });

        it("sorts by publishDate", async () => {
            await db.bulkPut([
                contentDoc({ _id: "later", publishDate: 300 }),
                contentDoc({ _id: "earlier", publishDate: 100 }),
            ]);

            const { api, scope } = await run(
                baseOptions({ orderBy: "publishDate", orderDirection: "asc" }),
            );
            await waitForExpect(() => {
                expect(api.docs.value.map((d) => d._id)).toEqual(["earlier", "later"]);
            });
            scope.stop();
        });

        it("sorting by expiryDate excludes docs that have no expiryDate at all", async () => {
            await db.bulkPut([
                contentDoc({ _id: "expires-soon", expiryDate: 200 }),
                contentDoc({ _id: "expires-later", expiryDate: 400 }),
                contentDoc({ _id: "never-expires" }), // no expiryDate field
            ]);

            const { api, scope } = await run(
                baseOptions({ orderBy: "expiryDate", orderDirection: "asc" }),
            );
            await waitForExpect(() => {
                expect(api.docs.value.map((d) => d._id)).toEqual(["expires-soon", "expires-later"]);
            });
            scope.stop();
        });
    });

    describe("pagination", () => {
        it("hasMore is true when the raw result fills the current limit", async () => {
            await db.bulkPut(
                Array.from({ length: 5 }, (_, i) =>
                    contentDoc({ _id: `doc-${i}`, updatedTimeUtc: i }),
                ),
            );

            const { api, scope } = await run(baseOptions(), ref(3));
            await waitForExpect(() => {
                expect(api.docs.value.length).toBe(3);
                expect(api.hasMore.value).toBe(true);
            });
            scope.stop();
        });

        it("hasMore is false when the raw result is under the limit", async () => {
            await db.bulkPut(
                Array.from({ length: 2 }, (_, i) =>
                    contentDoc({ _id: `doc-${i}`, updatedTimeUtc: i }),
                ),
            );

            const { api, scope } = await run(baseOptions(), ref(5));
            await waitForExpect(() => {
                expect(api.docs.value.length).toBe(2);
                expect(api.hasMore.value).toBe(false);
            });
            scope.stop();
        });

        it("growing the limit ref (load more) returns more docs from the same query", async () => {
            await db.bulkPut(
                Array.from({ length: 5 }, (_, i) =>
                    contentDoc({ _id: `doc-${i}`, updatedTimeUtc: i }),
                ),
            );

            const limit = ref(2);
            const { api, scope } = await run(baseOptions(), limit);
            await waitForExpect(() => {
                expect(api.docs.value.length).toBe(2);
                expect(api.hasMore.value).toBe(true);
            });

            // A window that exactly matches the doc count still reads as "may be more" (a full
            // window implies there could be more — same convention as useFtsSearch.hasMore); only
            // a window that exceeds the available docs proves there's nothing left to load.
            limit.value = 10;
            await waitForExpect(() => {
                expect(api.docs.value.length).toBe(5);
                expect(api.hasMore.value).toBe(false);
            });
            scope.stop();
        });
    });
});
