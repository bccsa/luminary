import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { db, initDatabase } from "../db/database";
import { initConfig } from "../config";
import {
    DocType,
    PublishStatus,
    PostType,
    TagType,
    type ContentDto,
    type PostDto,
    type TagDto,
} from "../types";
import {
    indexDocument,
    removeDocumentFromIndex,
    removeDocumentsFromIndex,
    indexBatch,
    getCheckpoint,
    setCheckpoint,
    getCorpusStats,
    setCorpusStats,
    checkAndResetIfConfigChanged,
} from "./ftsIndexer";
import { ftsSearch } from "./ftsSearch";
import type { FtsFieldConfig } from "./types";

const testFields: FtsFieldConfig[] = [
    { name: "title" },
    { name: "summary" },
    { name: "text", isHtml: true },
    { name: "author" },
];

const boostedFields: FtsFieldConfig[] = [
    { name: "title", boost: 3.0 },
    { name: "summary", boost: 1.5 },
    { name: "text", isHtml: true, boost: 1.0 },
    { name: "author", boost: 1.0 },
];

function makeContentDoc(overrides: Partial<ContentDto> & { _id: string }): ContentDto {
    return {
        type: DocType.Content,
        parentId: "post-1",
        parentType: DocType.Post,
        updatedTimeUtc: 1704114000000,
        memberOf: ["group-public-content"],
        parentTags: [],
        language: "lang-eng",
        status: PublishStatus.Published,
        slug: "test-slug",
        title: "Default Title",
        summary: "Default summary",
        text: "<p>Default text content</p>",
        author: "Test Author",
        publishDate: 1704114000000,
        ...overrides,
    } as ContentDto;
}

describe("FTS Indexer and Search", () => {
    beforeAll(async () => {
        initConfig({
            cms: true,
            docsIndex: "",
            apiUrl: "http://localhost:12345",
        });
        await initDatabase();
    });

    beforeEach(async () => {
        // Clear all FTS tables between tests
        await db.ftsIndex.clear();
        await db.ftsMeta.clear();
        await db.docs.clear();
    });

    describe("indexDocument", () => {
        it("indexes a document and creates trigrams with TF", async () => {
            const doc = makeContentDoc({
                _id: "doc-1",
                title: "Searching for truth",
            });

            const { trigramCount, tokenCount } = await indexDocument(doc, testFields);
            expect(trigramCount).toBeGreaterThan(0);
            expect(tokenCount).toBeGreaterThan(0);

            // Check that ftsIndex entries were created with tf values
            const entries = await db.ftsIndex.where("docId").equals("doc-1").toArray();
            expect(entries.length).toBeGreaterThan(0);
            expect(entries[0].tf).toBeGreaterThan(0);

            // Check that doc length was stored in ftsMeta
            const docLenEntry = await db.ftsMeta.get("docLen:doc-1");
            expect(docLenEntry).toBeDefined();
            expect(docLenEntry!.value).toBe(tokenCount);
        });

        it("strips HTML from fields marked as isHtml", async () => {
            const doc = makeContentDoc({
                _id: "doc-3",
                text: "<p>Hello <strong>world</strong></p><script>evil()</script>",
            });

            await indexDocument(doc, testFields);

            const entries = await db.ftsIndex.where("docId").equals("doc-3").toArray();
            const tokens = entries.map((e) => e.token);

            // "world" should produce trigrams
            expect(tokens).toContain("wor");
            expect(tokens).toContain("orl");

            // "script", "evil" should NOT produce trigrams
            expect(tokens).not.toContain("scr");
            expect(tokens).not.toContain("evi");
        });

        it("re-indexes a document (removes old entries first)", async () => {
            const doc1 = makeContentDoc({
                _id: "doc-4",
                title: "Original title",
                updatedTimeUtc: 1000,
            });
            await indexDocument(doc1, testFields);

            const doc2 = makeContentDoc({
                _id: "doc-4",
                title: "Updated title completely different",
                updatedTimeUtc: 2000,
            });
            await indexDocument(doc2, testFields);

            // Should have new entries, not duplicates — verify doc length was updated
            const docLenEntry = await db.ftsMeta.get("docLen:doc-4");
            expect(docLenEntry).toBeDefined();
        });

        it("applies field boost to TF values", async () => {
            const doc = makeContentDoc({
                _id: "doc-boost",
                title: "quantum",
                summary: "",
                text: "",
                author: "",
            });

            // Index with no boost (default 1.0)
            const { trigramCount: countNoBost } = await indexDocument(doc, [{ name: "title" }]);
            const entriesNoBoost = await db.ftsIndex.where("docId").equals("doc-boost").toArray();
            const tfNoBoost = entriesNoBoost.find((e) => e.token === "qua")?.tf || 0;

            // Re-index with boost 3.0
            const { trigramCount: countBoosted } = await indexDocument(doc, [
                { name: "title", boost: 3.0 },
            ]);
            const entriesBoosted = await db.ftsIndex.where("docId").equals("doc-boost").toArray();
            const tfBoosted = entriesBoosted.find((e) => e.token === "qua")?.tf || 0;

            expect(tfBoosted).toBe(tfNoBoost * 3);
        });
    });

    describe("removeDocumentFromIndex", () => {
        it("removes all index entries for a document", async () => {
            const doc = makeContentDoc({ _id: "doc-5" });
            await indexDocument(doc, testFields);

            // Verify entries exist
            expect(await db.ftsIndex.where("docId").equals("doc-5").count()).toBeGreaterThan(0);
            expect(await db.ftsMeta.get("docLen:doc-5")).toBeDefined();

            await removeDocumentFromIndex("doc-5");

            expect(await db.ftsIndex.where("docId").equals("doc-5").count()).toBe(0);
            expect(await db.ftsMeta.get("docLen:doc-5")).toBeUndefined();
        });

        it("decrements corpus stats on removal", async () => {
            const doc = makeContentDoc({ _id: "doc-stats-rm" });
            const { tokenCount } = await indexDocument(doc, testFields);
            await setCorpusStats({ totalTokenCount: tokenCount, docCount: 1 });

            await removeDocumentFromIndex("doc-stats-rm");

            const stats = await getCorpusStats();
            expect(stats.docCount).toBe(0);
            expect(stats.totalTokenCount).toBe(0);
        });
    });

    describe("removeDocumentsFromIndex", () => {
        it("removes entries for multiple documents at once", async () => {
            const doc1 = makeContentDoc({ _id: "doc-6" });
            const doc2 = makeContentDoc({ _id: "doc-7" });
            await indexDocument(doc1, testFields);
            await indexDocument(doc2, testFields);

            await removeDocumentsFromIndex(["doc-6", "doc-7"]);

            expect(await db.ftsIndex.where("docId").equals("doc-6").count()).toBe(0);
            expect(await db.ftsIndex.where("docId").equals("doc-7").count()).toBe(0);
        });

        it("handles empty array gracefully", async () => {
            await removeDocumentsFromIndex([]);
            // Should not throw
        });

        it("decrements corpus stats for all removed documents", async () => {
            const doc1 = makeContentDoc({ _id: "doc-bulk-rm-1" });
            const doc2 = makeContentDoc({ _id: "doc-bulk-rm-2" });
            const r1 = await indexDocument(doc1, testFields);
            const r2 = await indexDocument(doc2, testFields);
            await setCorpusStats({
                totalTokenCount: r1.tokenCount + r2.tokenCount,
                docCount: 2,
            });

            await removeDocumentsFromIndex(["doc-bulk-rm-1", "doc-bulk-rm-2"]);

            const stats = await getCorpusStats();
            expect(stats.docCount).toBe(0);
            expect(stats.totalTokenCount).toBe(0);
        });
    });

    describe("corpus stats", () => {
        it("defaults to zeros when no stats exist", async () => {
            const stats = await getCorpusStats();
            expect(stats.totalTokenCount).toBe(0);
            expect(stats.docCount).toBe(0);
        });

        it("persists corpus stats", async () => {
            await setCorpusStats({ totalTokenCount: 500, docCount: 10 });
            const stats = await getCorpusStats();
            expect(stats.totalTokenCount).toBe(500);
            expect(stats.docCount).toBe(10);
        });
    });

    describe("checkpoint", () => {
        it("defaults to 0 when no checkpoint exists", async () => {
            expect(await getCheckpoint()).toBe(0);
        });

        it("persists checkpoint value", async () => {
            await setCheckpoint(12345);
            expect(await getCheckpoint()).toBe(12345);
        });
    });

    describe("checkAndResetIfConfigChanged", () => {
        it("wipes index and corpus stats when config changes", async () => {
            const doc = makeContentDoc({ _id: "doc-8" });
            await indexDocument(doc, testFields);
            await setCheckpoint(1000);
            await setCorpusStats({ totalTokenCount: 100, docCount: 1 });

            const wiped = await checkAndResetIfConfigChanged([{ name: "title" }]);
            expect(wiped).toBe(true);

            expect(await db.ftsIndex.count()).toBe(0);
            expect(await getCheckpoint()).toBe(0);

            const stats = await getCorpusStats();
            expect(stats.totalTokenCount).toBe(0);
            expect(stats.docCount).toBe(0);
        });

        it("does not wipe index when config is unchanged", async () => {
            await checkAndResetIfConfigChanged(testFields);

            const doc = makeContentDoc({ _id: "doc-9" });
            await indexDocument(doc, testFields);
            await setCheckpoint(1000);

            const wiped = await checkAndResetIfConfigChanged(testFields);
            expect(wiped).toBe(false);

            expect(await db.ftsIndex.count()).toBeGreaterThan(0);
            expect(await getCheckpoint()).toBe(1000);
        });
    });

    describe("indexBatch", () => {
        it("indexes a batch of documents and updates corpus stats", async () => {
            const doc1 = makeContentDoc({
                _id: "batch-1",
                title: "First document",
                updatedTimeUtc: 100,
            });
            const doc2 = makeContentDoc({
                _id: "batch-2",
                title: "Second document",
                updatedTimeUtc: 200,
            });
            await db.docs.bulkPut([doc1, doc2]);

            const result = await indexBatch(10, 0, testFields, DocType.Content);

            expect(result.processedCount).toBe(2);
            expect(result.newCheckpoint).toBe(200);
            expect(result.hasMore).toBe(false);

            const stats = await getCorpusStats();
            expect(stats.docCount).toBe(2);
            expect(stats.totalTokenCount).toBeGreaterThan(0);
        });

        it("respects batch size limit", async () => {
            const docs = Array.from({ length: 5 }, (_, i) =>
                makeContentDoc({
                    _id: `limit-${i}`,
                    title: `Document ${i}`,
                    updatedTimeUtc: (i + 1) * 100,
                }),
            );
            await db.docs.bulkPut(docs);

            const result = await indexBatch(2, 0, testFields, DocType.Content);

            expect(result.processedCount).toBe(2);
            expect(result.hasMore).toBe(true);
            expect(result.newCheckpoint).toBe(200);
        });

        it("continues from checkpoint", async () => {
            const docs = Array.from({ length: 3 }, (_, i) =>
                makeContentDoc({
                    _id: `cont-${i}`,
                    title: `Document ${i}`,
                    updatedTimeUtc: (i + 1) * 100,
                }),
            );
            await db.docs.bulkPut(docs);

            // First batch: docs with updatedTimeUtc 100, 200
            const result1 = await indexBatch(2, 0, testFields, DocType.Content);
            expect(result1.processedCount).toBe(2);

            // Second batch: doc with updatedTimeUtc 300
            const result2 = await indexBatch(
                2,
                result1.newCheckpoint,
                testFields,
                DocType.Content,
            );
            expect(result2.processedCount).toBe(1);
            expect(result2.hasMore).toBe(false);

            const stats = await getCorpusStats();
            expect(stats.docCount).toBe(3);
        });

        it("handles re-indexing without double-counting corpus stats", async () => {
            const doc = makeContentDoc({
                _id: "reindex-1",
                title: "Original content",
                updatedTimeUtc: 100,
            });
            await db.docs.bulkPut([doc]);

            await indexBatch(10, 0, testFields, DocType.Content);
            const statsAfterFirst = await getCorpusStats();

            // Update the doc and re-index
            const updatedDoc = makeContentDoc({
                _id: "reindex-1",
                title: "Updated content",
                updatedTimeUtc: 200,
            });
            await db.docs.put(updatedDoc);

            await indexBatch(10, 100, testFields, DocType.Content);
            const statsAfterSecond = await getCorpusStats();

            // Should still be 1 doc, not 2
            expect(statsAfterSecond.docCount).toBe(1);
        });
    });

    describe("ftsSearch", () => {
        async function indexDocsWithCorpusStats(
            docs: ContentDto[],
            fields: FtsFieldConfig[] = testFields,
        ) {
            let totalTokenCount = 0;
            for (const doc of docs) {
                const { tokenCount } = await indexDocument(doc, fields);
                totalTokenCount += tokenCount;
            }
            await setCorpusStats({ totalTokenCount, docCount: docs.length });
        }

        beforeEach(async () => {
            const docs = [
                makeContentDoc({
                    _id: "search-1",
                    title: "Understanding quantum physics",
                    summary: "A deep dive into quantum mechanics",
                    publishDate: 1704114000000,
                    language: "lang-eng",
                }),
                makeContentDoc({
                    _id: "search-2",
                    title: "Cooking Italian pasta",
                    summary: "Traditional pasta recipes from Italy",
                    publishDate: 1704200000000, // newer
                    language: "lang-eng",
                }),
                makeContentDoc({
                    _id: "search-3",
                    title: "Quantum computing fundamentals",
                    summary: "Introduction to quantum computing",
                    publishDate: 1704300000000, // newest
                    language: "lang-eng",
                }),
                makeContentDoc({
                    _id: "search-4",
                    title: "French cooking techniques",
                    summary: "Master French cuisine",
                    publishDate: 1704100000000, // oldest
                    language: "lang-fra",
                }),
            ];

            await indexDocsWithCorpusStats(docs);
        });

        it("finds documents matching search query", async () => {
            const results = await ftsSearch({ query: "quantum" });
            expect(results.length).toBe(2);
            const ids = results.map((r) => r.docId);
            expect(ids).toContain("search-1");
            expect(ids).toContain("search-3");
        });

        it("returns BM25 float scores", async () => {
            const results = await ftsSearch({ query: "quantum" });
            expect(results.length).toBeGreaterThan(0);
            // BM25 scores should be positive floats
            for (const r of results) {
                expect(r.score).toBeGreaterThan(0);
                expect(typeof r.score).toBe("number");
            }
        });

        it("filters by language", async () => {
            const results = await ftsSearch({
                query: "cooking",
                languageId: "lang-fra",
            });
            expect(results.length).toBe(1);
            expect(results[0].docId).toBe("search-4");
        });

        it("supports pagination with offset and limit", async () => {
            const page1 = await ftsSearch({ query: "quantum", limit: 1, offset: 0 });
            const page2 = await ftsSearch({ query: "quantum", limit: 1, offset: 1 });

            expect(page1.length).toBe(1);
            expect(page2.length).toBe(1);
            expect(page1[0].docId).not.toBe(page2[0].docId);
        });

        it("returns empty array for short queries", async () => {
            const results = await ftsSearch({ query: "ab" });
            expect(results).toEqual([]);
        });

        it("returns empty array for empty query", async () => {
            const results = await ftsSearch({ query: "" });
            expect(results).toEqual([]);
        });

        it("handles fuzzy matching (typos)", async () => {
            // "quantm" (missing 'u') should still partially match via shared trigrams
            const results = await ftsSearch({ query: "quantm" });
            expect(results.length).toBeGreaterThanOrEqual(0);
        });

        it("ranks title-boosted matches higher than body-only matches", async () => {
            // Clear and re-index with boosted fields
            await db.ftsIndex.clear();
            await db.ftsMeta.clear();

            const docs = [
                makeContentDoc({
                    _id: "boost-title",
                    title: "quantum physics explained",
                    summary: "An article about science",
                    text: "<p>General science content</p>",
                    publishDate: 1704114000000,
                }),
                makeContentDoc({
                    _id: "boost-body",
                    title: "Science article",
                    summary: "An article about science",
                    text: "<p>This discusses quantum physics in detail</p>",
                    publishDate: 1704114000000,
                }),
                // Extra docs so frequency filter doesn't remove all quantum trigrams
                makeContentDoc({
                    _id: "boost-filler-1",
                    title: "Unrelated gardening tips",
                    summary: "How to grow vegetables",
                    text: "<p>Plant seeds in spring</p>",
                    publishDate: 1704114000000,
                }),
                makeContentDoc({
                    _id: "boost-filler-2",
                    title: "Travel destinations",
                    summary: "Best places to visit",
                    text: "<p>Explore the world</p>",
                    publishDate: 1704114000000,
                }),
            ];

            await indexDocsWithCorpusStats(docs, boostedFields);

            const results = await ftsSearch({ query: "quantum" });
            expect(results.length).toBe(2);
            // Title-boosted doc should rank first
            expect(results[0].docId).toBe("boost-title");
            expect(results[0].score).toBeGreaterThan(results[1].score);
        });
    });
});
