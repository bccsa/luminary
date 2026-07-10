import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { effectScope, nextTick } from "vue";
import {
    db,
    DocType,
    PostType,
    PublishStatus,
    recomputeCorpusStats,
    type ContentDto,
} from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { useContentSearchQuery } from "../useContentSearchQuery";
import type { ContentOverviewQueryOptions } from "../types";

// Trigrams of "garden", title-boosted (tf 3). Matching docs carry these so they're trigram
// candidates; the strict substring check then matches on the actual title text.
const GARDEN_FTS = ["gar:3", "ard:3", "rde:3", "den:3"];

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
        search: "garden",
        ...over,
    };
}

describe("useContentSearchQuery strict-mode sorting", () => {
    beforeEach(async () => {
        await db.docs.clear();
        await db.bulkPut([
            contentDoc({ _id: "g-old", title: "Garden A", updatedTimeUtc: 100, fts: GARDEN_FTS, ftsTokenCount: 4 }),
            contentDoc({ _id: "g-new", title: "Garden B", updatedTimeUtc: 300, fts: GARDEN_FTS, ftsTokenCount: 4 }),
            contentDoc({ _id: "g-mid", title: "Garden C", updatedTimeUtc: 200, fts: GARDEN_FTS, ftsTokenCount: 4 }),
        ]);
        // Noise docs (no "garden" trigrams) keep the garden trigrams under the 50% high-df cutoff.
        await db.bulkPut(
            Array.from({ length: 6 }, (_, i) =>
                contentDoc({ _id: `noise-${i}`, title: `Other ${i}`, fts: ["xyz:1"], ftsTokenCount: 1 }),
            ),
        );
        await recomputeCorpusStats();
    });

    async function run(options: ContentOverviewQueryOptions) {
        const scope = effectScope();
        let api!: ReturnType<typeof useContentSearchQuery>;
        scope.run(() => {
            api = useContentSearchQuery(() => options);
        });
        await new Promise((r) => setTimeout(r, 200)); // let the debounced search settle
        await nextTick();
        return { api, scope };
    }

    it("orders strict results by updatedTimeUtc desc", async () => {
        const { api, scope } = await run(baseOptions({ orderDirection: "desc" }));
        await waitForExpect(() => {
            expect(api.docs.value.map((d) => d._id)).toEqual(["g-new", "g-mid", "g-old"]);
        });
        scope.stop();
    });

    it("orders strict results by updatedTimeUtc asc", async () => {
        const { api, scope } = await run(baseOptions({ orderDirection: "asc" }));
        await waitForExpect(() => {
            expect(api.docs.value.map((d) => d._id)).toEqual(["g-old", "g-mid", "g-new"]);
        });
        scope.stop();
    });

    it("orders by relevance (no field sort) while still enforcing the exact match", async () => {
        const { api, scope } = await run(baseOptions({ orderBy: "relevance" }));
        await waitForExpect(() => {
            // All three exact matches are returned (matchAllWords still applied); ordering is
            // by BM25 relevance rather than a field.
            expect(api.docs.value.map((d) => d._id).sort()).toEqual(["g-mid", "g-new", "g-old"]);
        });
        scope.stop();
    });

    it("orders strict results by title ascending", async () => {
        const { api, scope } = await run(baseOptions({ orderBy: "title", orderDirection: "asc" }));
        await waitForExpect(() => {
            // Garden A < Garden B < Garden C
            expect(api.docs.value.map((d) => d._id)).toEqual(["g-old", "g-new", "g-mid"]);
        });
        scope.stop();
    });
});

describe("useContentSearchQuery date range filters", () => {
    beforeEach(async () => {
        await db.docs.clear();
        await db.bulkPut([
            contentDoc({
                _id: "in-range",
                title: "Garden A",
                publishDate: 500,
                expiryDate: 500,
                fts: GARDEN_FTS,
                ftsTokenCount: 4,
            }),
            contentDoc({
                _id: "too-early",
                title: "Garden B",
                publishDate: 100,
                expiryDate: 100,
                fts: GARDEN_FTS,
                ftsTokenCount: 4,
            }),
            contentDoc({
                _id: "too-late",
                title: "Garden C",
                publishDate: 900,
                expiryDate: 900,
                fts: GARDEN_FTS,
                ftsTokenCount: 4,
            }),
        ]);
        await db.bulkPut(
            Array.from({ length: 6 }, (_, i) =>
                contentDoc({ _id: `noise-${i}`, title: `Other ${i}`, fts: ["xyz:1"], ftsTokenCount: 1 }),
            ),
        );
        await recomputeCorpusStats();
    });

    async function run(options: ContentOverviewQueryOptions) {
        const scope = effectScope();
        let api!: ReturnType<typeof useContentSearchQuery>;
        scope.run(() => {
            api = useContentSearchQuery(() => options);
        });
        await new Promise((r) => setTimeout(r, 200));
        await nextTick();
        return { api, scope };
    }

    it("filters by publishedAfter/publishedBefore range", async () => {
        const { api, scope } = await run(
            baseOptions({ publishedAfter: 400, publishedBefore: 600 }),
        );
        await waitForExpect(() => {
            expect(api.docs.value.map((d) => d._id)).toEqual(["in-range"]);
        });
        scope.stop();
    });

    it("filters by expiresAfter/expiresBefore range", async () => {
        const { api, scope } = await run(baseOptions({ expiresAfter: 400, expiresBefore: 600 }));
        await waitForExpect(() => {
            expect(api.docs.value.map((d) => d._id)).toEqual(["in-range"]);
        });
        scope.stop();
    });
});
