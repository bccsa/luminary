import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "luminary-shared";
import { mockEnglishContentDto } from "@/tests/mockdata";
import {
    initializeSearchIndex,
    clearSearchIndex,
    search,
    getSearchIndexSize,
} from "./search";
import { registerSearchIndexSync } from "./searchIndexSync";

function flushMicrotasks(): Promise<void> {
    return new Promise((resolve) => {
        queueMicrotask(() => resolve());
    });
}

describe("searchIndexSync.ts", () => {
    beforeEach(async () => {
        clearSearchIndex();
        await db.docs.clear();
        await initializeSearchIndex();
        registerSearchIndexSync();
    });

    afterEach(async () => {
        clearSearchIndex();
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("adds new content documents to the index when they are written to IndexedDB", async () => {
        expect(getSearchIndexSize()).toBe(0);

        await db.docs.put(mockEnglishContentDto);
        await flushMicrotasks();

        expect(getSearchIndexSize()).toBe(1);
        const results = search("Post");
        expect(results.length).toBe(1);
        expect(results[0]._id).toBe(mockEnglishContentDto._id);
    });

    it("removes content documents from the index when they are deleted from IndexedDB", async () => {
        await db.docs.put(mockEnglishContentDto);
        await flushMicrotasks();
        expect(getSearchIndexSize()).toBe(1);

        await db.docs.delete(mockEnglishContentDto._id);
        await flushMicrotasks();

        expect(getSearchIndexSize()).toBe(0);
        expect(search("Post").length).toBe(0);
    });

    it("can be called multiple times without double-registering hooks", async () => {
        registerSearchIndexSync();
        registerSearchIndexSync();

        await db.docs.put(mockEnglishContentDto);
        await flushMicrotasks();

        expect(getSearchIndexSize()).toBe(1);
    });
});
