import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "luminary-shared";
import type { ContentDto } from "luminary-shared";
import { mockEnglishContentDto, mockFrenchContentDto } from "@/tests/mockdata";
import {
    initializeSearchIndex,
    clearSearchIndex,
    search,
    addToSearchIndex,
    addAllToSearchIndex,
    removeFromSearchIndex,
    removeAllFromSearchIndex,
    updateSearchIndex,
    isSearchIndexInitialized,
    getSearchIndexSize,
    rebuildSearchIndex,
    searchIndexSizeRef,
} from "./search";

describe("search.ts", () => {
    beforeEach(async () => {
        clearSearchIndex();
        await db.docs.clear();
        await db.docs.bulkPut([mockEnglishContentDto, mockFrenchContentDto]);
        await initializeSearchIndex();
    });

    afterEach(async () => {
        clearSearchIndex();
        await db.docs.clear();
        await db.localChanges.clear();
    });

    describe("initialization", () => {
        it("is initialized after initializeSearchIndex", () => {
            expect(isSearchIndexInitialized()).toBe(true);
        });

        it("reports index size from IndexedDB content", () => {
            expect(getSearchIndexSize()).toBe(2);
            expect(searchIndexSizeRef.value).toBe(2);
        });

        it("does not double-initialize", async () => {
            await initializeSearchIndex();
            expect(getSearchIndexSize()).toBe(2);
        });
    });

    describe("search", () => {
        it("returns results matching the query", () => {
            const results = search("Post");
            expect(results.length).toBeGreaterThanOrEqual(1);
            expect(results.some((r) => r.title && String(r.title).includes("Post"))).toBe(true);
        });

        it("returns results matching body text", () => {
            const results = search("Willowdale");
            expect(results.length).toBeGreaterThanOrEqual(1);
        });

        it("returns empty array for empty or whitespace query", () => {
            expect(search("")).toEqual([]);
            expect(search("   ")).toEqual([]);
        });

        it("returns empty array when index not initialized", () => {
            clearSearchIndex();
            expect(search("Post")).toEqual([]);
        });

        it("filters by languages when provided", () => {
            const enResults = search("Post", { languages: ["lang-eng"] });
            const frResults = search("Post", { languages: ["lang-fra"] });
            expect(enResults.every((r) => r.language === "lang-eng")).toBe(true);
            expect(frResults.every((r) => r.language === "lang-fra")).toBe(true);
        });

        it("returns at most SEARCH_RESULT_LIMIT results", async () => {
            clearSearchIndex();
            await db.docs.clear();
            const docs: ContentDto[] = [];
            for (let i = 0; i < 25; i++) {
                docs.push({
                    ...mockEnglishContentDto,
                    _id: `content-${i}`,
                    title: `Post ${i} unique`,
                    slug: `post-${i}`,
                });
            }
            await db.docs.bulkPut(docs);
            await initializeSearchIndex();
            const results = search("Post");
            expect(results.length).toBe(20);
        });

        it("adds highlight to results when match in text", () => {
            const results = search("Willowdale");
            const withHighlight = results.find((r) => r.highlight && r.highlight.includes("Willowdale"));
            expect(withHighlight).toBeDefined();
        });
    });

    describe("index mutations", () => {
        it("addToSearchIndex adds a document and size increases", () => {
            const extra: ContentDto = {
                ...mockEnglishContentDto,
                _id: "content-extra",
                title: "Extra doc",
                slug: "extra",
            };
            addToSearchIndex(extra);
            expect(getSearchIndexSize()).toBe(3);
            const results = search("Extra");
            expect(results.some((r) => r._id === "content-extra")).toBe(true);
        });

        it("addAllToSearchIndex adds multiple documents", () => {
            const extras: ContentDto[] = [
                { ...mockEnglishContentDto, _id: "c1", title: "Alpha", slug: "alpha" },
                { ...mockEnglishContentDto, _id: "c2", title: "Beta", slug: "beta" },
            ];
            addAllToSearchIndex(extras);
            expect(getSearchIndexSize()).toBe(4);
            expect(search("Alpha").length).toBeGreaterThanOrEqual(1);
            expect(search("Beta").length).toBeGreaterThanOrEqual(1);
        });

        it("removeFromSearchIndex removes a document", () => {
            removeFromSearchIndex(mockEnglishContentDto._id);
            expect(getSearchIndexSize()).toBe(1);
            expect(search("Post 1").some((r) => r._id === mockEnglishContentDto._id)).toBe(false);
        });

        it("removeFromSearchIndex does not throw for unknown id", () => {
            expect(() => removeFromSearchIndex("nonexistent-id")).not.toThrow();
        });

        it("removeAllFromSearchIndex removes multiple documents", () => {
            removeAllFromSearchIndex([mockEnglishContentDto._id, mockFrenchContentDto._id]);
            expect(getSearchIndexSize()).toBe(0);
        });

        it("updateSearchIndex updates a document", () => {
            updateSearchIndex({
                ...mockEnglishContentDto,
                title: "Updated title",
            });
            const results = search("Updated");
            expect(results.some((r) => r.title === "Updated title")).toBe(true);
        });
    });

    describe("clearSearchIndex", () => {
        it("clears the index and resets size ref", () => {
            clearSearchIndex();
            expect(isSearchIndexInitialized()).toBe(false);
            expect(getSearchIndexSize()).toBe(0);
            expect(searchIndexSizeRef.value).toBe(0);
        });
    });

    describe("rebuildSearchIndex", () => {
        it("clears and reinitializes from IndexedDB", async () => {
            await rebuildSearchIndex();
            expect(isSearchIndexInitialized()).toBe(true);
            expect(getSearchIndexSize()).toBe(2);
        });
    });
});
