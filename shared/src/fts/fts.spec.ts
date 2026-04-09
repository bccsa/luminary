import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { db, initDatabase } from "../db/database";
import { initConfig } from "../config";
import {
    DocType,
    PublishStatus,
    type ContentDto,
} from "../types";
import {
    getCorpusStats,
    setCorpusStats,
    recomputeCorpusStats,
    scheduleCorpusStatsRecompute,
} from "./ftsIndexer";
import { ftsSearch } from "./ftsSearch";

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

/**
 * Helper: generate simple trigram FTS data for a word.
 * Returns entries in "token:tf" string format.
 */
function generateSimpleFtsEntries(word: string, boost: number = 1.0): { entries: string[]; tokenCount: number } {
    const normalized = word.toLowerCase();
    const entries: string[] = [];
    const seen = new Set<string>();
    let tokenCount = 0;
    for (let i = 0; i <= normalized.length - 3; i++) {
        const trigram = normalized.substring(i, i + 3);
        tokenCount++;
        if (!seen.has(trigram)) {
            seen.add(trigram);
            entries.push(trigram + ":" + boost);
        }
    }
    return { entries, tokenCount };
}

/**
 * Helper: merge FTS entries from multiple fields (simulates API computeFtsData).
 */
function mergeFtsEntries(...fieldResults: Array<{ entries: string[]; tokenCount: number }>): { entries: string[]; tokenCount: number } {
    const aggregated = new Map<string, number>();
    let totalTokenCount = 0;
    for (const { entries, tokenCount } of fieldResults) {
        totalTokenCount += tokenCount;
        for (const entry of entries) {
            const colonIdx = entry.indexOf(":", 3);
            const token = entry.substring(0, colonIdx);
            const tf = parseFloat(entry.substring(colonIdx + 1));
            aggregated.set(token, (aggregated.get(token) || 0) + tf);
        }
    }
    return {
        entries: Array.from(aggregated.entries()).map(([token, tf]) => token + ":" + tf),
        tokenCount: totalTokenCount,
    };
}

/**
 * Helper: ingest a doc with FTS data via bulkPut.
 */
async function ingestDocWithFts(doc: ContentDto, ftsEntries: string[], tokenCount: number) {
    doc.fts = ftsEntries;
    doc.ftsTokenCount = tokenCount;
    await db.bulkPut([doc]);
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
        await db.docs.clear();
        await db.luminaryInternals.clear();
    });

    describe("FTS ingestion via bulkPut", () => {
        it("stores FTS data on the document via MultiEntry index", async () => {
            const { entries, tokenCount } = generateSimpleFtsEntries("quantum");
            const doc = makeContentDoc({ _id: "doc-1", title: "quantum" });

            await ingestDocWithFts(doc, entries, tokenCount);

            const storedDoc = await db.docs.get("doc-1") as ContentDto;
            expect(storedDoc.fts).toBeDefined();
            expect(storedDoc.fts!.length).toBe(entries.length);
            expect(storedDoc.fts![0]).toMatch(/^[a-z]{3}:\d/);
        });

        it("keeps fts array and ftsTokenCount on stored document", async () => {
            const { entries, tokenCount } = generateSimpleFtsEntries("quantum");
            const doc = makeContentDoc({ _id: "doc-strip", title: "quantum" });

            await ingestDocWithFts(doc, entries, tokenCount);

            const storedDoc = await db.docs.get("doc-strip") as ContentDto;
            expect(storedDoc.fts).toBeDefined();
            expect(storedDoc.ftsTokenCount).toBe(tokenCount);
        });

        it("computes corpus stats after ingesting ContentDtos", async () => {
            const { entries, tokenCount } = generateSimpleFtsEntries("quantum");
            const doc = makeContentDoc({ _id: "doc-stats", title: "quantum" });

            await ingestDocWithFts(doc, entries, tokenCount);

            const stats = await getCorpusStats();
            expect(stats.docCount).toBe(1);
            expect(stats.totalTokenCount).toBe(tokenCount);
        });

        it("handles re-indexing by replacing document with new FTS data", async () => {
            const { entries: entries1, tokenCount: tc1 } = generateSimpleFtsEntries("original");
            const doc1 = makeContentDoc({ _id: "doc-reindex", title: "original" });
            await ingestDocWithFts(doc1, entries1, tc1);

            const { entries: entries2, tokenCount: tc2 } = generateSimpleFtsEntries("updated");
            const doc2 = makeContentDoc({ _id: "doc-reindex", title: "updated" });
            await ingestDocWithFts(doc2, entries2, tc2);

            const storedDoc = await db.docs.get("doc-reindex") as ContentDto;
            const tokens = storedDoc.fts!.map((e) => e.substring(0, 3));
            expect(tokens).toContain("upd"); // from "updated"
        });

        it("handles multiple documents in a single bulkPut", async () => {
            const { entries: e1, tokenCount: tc1 } = generateSimpleFtsEntries("quantum");
            const { entries: e2, tokenCount: tc2 } = generateSimpleFtsEntries("cooking");

            const doc1 = makeContentDoc({ _id: "multi-1", title: "quantum" });
            doc1.fts = e1;
            doc1.ftsTokenCount = tc1;

            const doc2 = makeContentDoc({ _id: "multi-2", title: "cooking" });
            doc2.fts = e2;
            doc2.ftsTokenCount = tc2;

            await db.bulkPut([doc1, doc2]);

            const stored1 = await db.docs.get("multi-1") as ContentDto;
            const stored2 = await db.docs.get("multi-2") as ContentDto;
            expect(stored1.fts!.length).toBe(e1.length);
            expect(stored2.fts!.length).toBe(e2.length);
        });
    });

    describe("recomputeCorpusStats", () => {
        it("computes correct stats from Content docs in the database", async () => {
            const { entries: e1, tokenCount: tc1 } = generateSimpleFtsEntries("quantum");
            const { entries: e2, tokenCount: tc2 } = generateSimpleFtsEntries("cooking");

            const doc1 = makeContentDoc({ _id: "recomp-1", title: "quantum" });
            await ingestDocWithFts(doc1, e1, tc1);
            const doc2 = makeContentDoc({ _id: "recomp-2", title: "cooking" });
            await ingestDocWithFts(doc2, e2, tc2);

            await recomputeCorpusStats();

            const stats = await getCorpusStats();
            expect(stats.docCount).toBe(2);
            expect(stats.totalTokenCount).toBe(tc1 + tc2);
        });

        it("handles re-indexed documents correctly", async () => {
            const { entries: e1, tokenCount: tc1 } = generateSimpleFtsEntries("original");
            const doc1 = makeContentDoc({ _id: "recomp-reindex", title: "original" });
            await ingestDocWithFts(doc1, e1, tc1);

            const { entries: e2, tokenCount: tc2 } = generateSimpleFtsEntries("updated");
            const doc2 = makeContentDoc({ _id: "recomp-reindex", title: "updated" });
            await ingestDocWithFts(doc2, e2, tc2);

            await recomputeCorpusStats();

            const stats = await getCorpusStats();
            expect(stats.docCount).toBe(1);
            expect(stats.totalTokenCount).toBe(tc2);
        });

        it("returns zeros when no Content docs exist", async () => {
            await recomputeCorpusStats();

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

    describe("ftsSearch", () => {
        async function setupSearchDocs() {
            // "quantum" trigrams: qua, uan, ant, ntu, tum — title boost 3.0
            const q1 = mergeFtsEntries(
                generateSimpleFtsEntries("quantum", 3.0), // title
                generateSimpleFtsEntries("mechanics", 1.5), // summary
            );
            const doc1 = makeContentDoc({
                _id: "search-1",
                title: "Understanding quantum physics",
                summary: "A deep dive into quantum mechanics",
                language: "lang-eng",
            });
            await ingestDocWithFts(doc1, q1.entries, q1.tokenCount);

            const q2 = mergeFtsEntries(
                generateSimpleFtsEntries("cooking", 3.0),
                generateSimpleFtsEntries("pasta", 1.5),
            );
            const doc2 = makeContentDoc({
                _id: "search-2",
                title: "Cooking Italian pasta",
                summary: "Traditional pasta recipes from Italy",
                language: "lang-eng",
            });
            await ingestDocWithFts(doc2, q2.entries, q2.tokenCount);

            const q3 = mergeFtsEntries(
                generateSimpleFtsEntries("quantum", 3.0),
                generateSimpleFtsEntries("computing", 1.5),
            );
            const doc3 = makeContentDoc({
                _id: "search-3",
                title: "Quantum computing fundamentals",
                summary: "Introduction to quantum computing",
                language: "lang-eng",
            });
            await ingestDocWithFts(doc3, q3.entries, q3.tokenCount);

            const q4 = mergeFtsEntries(
                generateSimpleFtsEntries("cooking", 3.0),
                generateSimpleFtsEntries("french", 1.5),
            );
            const doc4 = makeContentDoc({
                _id: "search-4",
                title: "French cooking techniques",
                summary: "Master French cuisine",
                language: "lang-fra",
            });
            await ingestDocWithFts(doc4, q4.entries, q4.tokenCount);

            // Corpus stats are computed by bulkPut, but ensure they're correct
            await recomputeCorpusStats();
        }

        beforeEach(async () => {
            await setupSearchDocs();
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

        it("returns empty array when corpus is empty (N=0)", async () => {
            await db.docs.clear();
            await db.luminaryInternals.clear();
            const results = await ftsSearch({ query: "quantum" });
            expect(results).toEqual([]);
        });

        it("handles custom BM25 parameters", async () => {
            const results = await ftsSearch({
                query: "quantum",
                bm25k1: 2.0,
                bm25b: 0.5,
            });
            expect(results.length).toBeGreaterThan(0);
            for (const r of results) {
                expect(r.score).toBeGreaterThan(0);
            }
        });

        it("filters over-represented trigrams via maxTrigramDocPercent", async () => {
            // With maxTrigramDocPercent=0, all trigrams should be filtered out
            const results = await ftsSearch({
                query: "quantum",
                maxTrigramDocPercent: 0,
            });
            expect(results).toEqual([]);
        });

        it("handles documents with no fts array", async () => {
            const doc = makeContentDoc({ _id: "no-fts", title: "quantum test" });
            // Insert without fts data
            await db.bulkPut([doc]);
            await recomputeCorpusStats();

            const results = await ftsSearch({ query: "quantum" });
            // Should still return other docs that have fts data
            const ids = results.map((r) => r.docId);
            expect(ids).not.toContain("no-fts");
        });

        it("handles documents with ftsTokenCount of 0", async () => {
            const doc = makeContentDoc({ _id: "zero-tc", title: "quantum zero" });
            doc.ftsTokenCount = 0;
            doc.fts = [];
            await db.bulkPut([doc]);
            await recomputeCorpusStats();

            const results = await ftsSearch({ query: "quantum" });
            const ids = results.map((r) => r.docId);
            expect(ids).not.toContain("zero-tc");
        });
    });

    describe("scheduleCorpusStatsRecompute", () => {
        it("triggers recomputation after debounce delay", async () => {
            const { entries, tokenCount } = generateSimpleFtsEntries("quantum");
            const doc = makeContentDoc({ _id: "sched-1", title: "quantum" });
            await ingestDocWithFts(doc, entries, tokenCount);

            // Clear stats so we can verify recomputation happened
            await db.luminaryInternals.clear();
            let stats = await getCorpusStats();
            expect(stats.docCount).toBe(0);

            // Schedule (debounced 10s) — call 3 times to test deduplication
            scheduleCorpusStatsRecompute();
            scheduleCorpusStatsRecompute();
            scheduleCorpusStatsRecompute();

            // Wait for debounce to fire
            await new Promise((r) => setTimeout(r, 11_000));

            stats = await getCorpusStats();
            expect(stats.docCount).toBe(1);
            expect(stats.totalTokenCount).toBe(tokenCount);
        }, 15_000);
    });
});
