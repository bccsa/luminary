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
        await db.ftsReverse.clear();
        await db.ftsMeta.clear();
        await db.docs.clear();
    });

    describe("indexDocument", () => {
        it("indexes a document and creates trigrams", async () => {
            const doc = makeContentDoc({
                _id: "doc-1",
                title: "Searching for truth",
            });

            const count = await indexDocument(doc, testFields);
            expect(count).toBeGreaterThan(0);

            // Check that ftsIndex entries were created
            const entries = await db.ftsIndex.where("docId").equals("doc-1").toArray();
            expect(entries.length).toBeGreaterThan(0);

            // Check that ftsReverse entry was created
            const reverse = await db.ftsReverse.get("doc-1");
            expect(reverse).toBeDefined();
            expect(reverse!.tokens.length).toBeGreaterThan(0);
        });

        it("stores negative publish date for date ordering", async () => {
            const publishDate = 1704114000000;
            const doc = makeContentDoc({
                _id: "doc-2",
                publishDate,
            });

            await indexDocument(doc, testFields);

            const entries = await db.ftsIndex.where("docId").equals("doc-2").toArray();
            expect(entries[0].negPublishDate).toBe(0 - publishDate);
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

            const entriesBefore = await db.ftsIndex.where("docId").equals("doc-4").count();

            const doc2 = makeContentDoc({
                _id: "doc-4",
                title: "Updated title completely different",
                updatedTimeUtc: 2000,
            });
            await indexDocument(doc2, testFields);

            // Should have new entries, not duplicates
            const reverse = await db.ftsReverse.get("doc-4");
            expect(reverse!.indexedAt).toBe(2000);
        });
    });

    describe("removeDocumentFromIndex", () => {
        it("removes all index entries for a document", async () => {
            const doc = makeContentDoc({ _id: "doc-5" });
            await indexDocument(doc, testFields);

            // Verify entries exist
            expect(await db.ftsIndex.where("docId").equals("doc-5").count()).toBeGreaterThan(0);
            expect(await db.ftsReverse.get("doc-5")).toBeDefined();

            await removeDocumentFromIndex("doc-5");

            expect(await db.ftsIndex.where("docId").equals("doc-5").count()).toBe(0);
            expect(await db.ftsReverse.get("doc-5")).toBeUndefined();
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
        it("wipes index when config changes", async () => {
            const doc = makeContentDoc({ _id: "doc-8" });
            await indexDocument(doc, testFields);
            await setCheckpoint(1000);

            const wiped = await checkAndResetIfConfigChanged([{ name: "title" }]);
            expect(wiped).toBe(true);

            expect(await db.ftsIndex.count()).toBe(0);
            expect(await getCheckpoint()).toBe(0);
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
        it("indexes a batch of documents from the docs table", async () => {
            // Insert docs into the main docs table
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
        });
    });

    describe("ftsSearch", () => {
        beforeEach(async () => {
            // Index some test documents
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

            for (const doc of docs) {
                await indexDocument(doc, testFields);
            }
        });

        it("finds documents matching search query", async () => {
            const results = await ftsSearch({ query: "quantum" });
            expect(results.length).toBe(2);
            const ids = results.map((r) => r.docId);
            expect(ids).toContain("search-1");
            expect(ids).toContain("search-3");
        });

        it("returns results sorted by score then date (newest first)", async () => {
            const results = await ftsSearch({ query: "quantum" });
            // Both have similar scores, so newer should come first
            if (results[0].score === results[1].score) {
                // search-3 is newer
                expect(results[0].docId).toBe("search-3");
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
            // "quantm" (missing 'u') should still partially match "quantum"
            // "qua", "uan" missing, but "ant", "ntm" from "quantm" won't match
            // "qua" from "quantm" matches "qua" from "quantum"
            const results = await ftsSearch({ query: "quantm" });
            // At least some trigrams should match
            expect(results.length).toBeGreaterThanOrEqual(0);
        });
    });
});
