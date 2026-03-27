import { describe, it, expect, beforeEach, vi } from "vitest";
import { syncBatch } from "./syncBatch";
import { setCancelSync } from "./sync";
import { syncList } from "./state";
import { DocType, BaseDocumentDto } from "../../types";

// We mock database bulkPut
vi.mock("../../db/database", () => ({ db: { bulkPut: vi.fn(async () => {}) } }));
// Import after mock so it uses mocked module
import { db } from "../../db/database";

// Helper to build docs
function makeDocs(count: number, start: number, step: number): BaseDocumentDto[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `doc-${i}`,
        type: DocType.Post,
        updatedTimeUtc: start - i * step,
        memberOf: ["g1"],
    })) as any;
}

describe("syncBatch", () => {
    beforeEach(() => {
        syncList.value = [];
        vi.clearAllMocks();
    });

    it("stops immediately when cancelSync flag set before starting", async () => {
        setCancelSync(true);
        const http = { post: vi.fn() };
        await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 10,
            initialSync: true,
            httpService: http as any,
        });
        expect(http.post).not.toHaveBeenCalled();
        expect(syncList.value.length).toBe(0);
        setCancelSync(false); // reset for subsequent tests
    });

    it("builds mango query for content type including parentType and languages (first call)", async () => {
        const docs = makeDocs(5, 5000, 10);
        const capturedBodies: any[] = [];
        const http = {
            post: vi.fn(async (_path: string, body: any) => {
                capturedBodies.push(body);
                return { docs };
            }),
        };
        const languages = ["en", "es"];
        await syncBatch({
            type: DocType.Content,
            subType: DocType.Post,
            memberOf: ["g1"],
            limit: 10,
            initialSync: true,
            languages,
            httpService: http as any,
        });
        expect(http.post.mock.calls.length).toBeGreaterThanOrEqual(1);
        const body = capturedBodies[0];
        expect(body.selector.parentType).toBe(DocType.Post);
        expect(body.selector.language.$in).toEqual(languages);
        expect(body.identifier).toBe("sync");
    });

    it("builds mango query for deleteCmd type including docType and language selector", async () => {
        const docs = makeDocs(5, 5000, 10);
        const capturedBodies: any[] = [];
        const http = {
            post: vi.fn(async (_path: string, body: any) => {
                capturedBodies.push(body);
                return { docs };
            }),
        };
        const languages = ["en", "es"];
        await syncBatch({
            type: DocType.DeleteCmd,
            subType: DocType.Post,
            memberOf: ["g1"],
            limit: 10,
            initialSync: true,
            languages,
            httpService: http as any,
        });
        expect(http.post.mock.calls.length).toBeGreaterThanOrEqual(1);
        const body = capturedBodies[0];
        expect(body.selector.docType).toBe(DocType.Post);
        expect(body.selector.language.$in).toEqual(languages);
    });

    it("does not add language selector to deleteCmd query when languages is empty", async () => {
        const docs = makeDocs(2, 2000, 10);
        const capturedBodies: any[] = [];
        const http = {
            post: vi.fn(async (_path: string, body: any) => {
                capturedBodies.push(body);
                return { docs };
            }),
        };
        await syncBatch({
            type: DocType.DeleteCmd,
            subType: DocType.Post,
            memberOf: ["g1"],
            limit: 10,
            initialSync: true,
            languages: [],
            httpService: http as any,
        });
        const body = capturedBodies[0];
        expect(body.selector.docType).toBe(DocType.Post);
        expect(body.selector.language).toBeUndefined();
    });

    it("does not add language selector to deleteCmd query when languages is undefined", async () => {
        const docs = makeDocs(2, 2000, 10);
        const capturedBodies: any[] = [];
        const http = {
            post: vi.fn(async (_path: string, body: any) => {
                capturedBodies.push(body);
                return { docs };
            }),
        };
        await syncBatch({
            type: DocType.DeleteCmd,
            subType: DocType.Post,
            memberOf: ["g1"],
            limit: 10,
            initialSync: true,
            httpService: http as any,
        });
        const body = capturedBodies[0];
        expect(body.selector.docType).toBe(DocType.Post);
        expect(body.selector.language).toBeUndefined();
    });

    it("adds cms flag when cms option set", async () => {
        const capturedBodies: any[] = [];
        const http = {
            post: vi.fn(async (_path: string, body: any) => {
                capturedBodies.push(body);
                return { docs: [] };
            }),
        };
        await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 10,
            initialSync: true,
            cms: true,
            httpService: http as any,
        });
        const body = capturedBodies[0];
        expect(body.cms).toBe(true);
        expect(body.identifier).toBe("sync");
    });
    it("marks eof true when returned docs length < limit", async () => {
        const docs = makeDocs(3, 3000, 10); // limit will be 5
        const capturedBodies: any[] = [];
        const http = {
            post: vi.fn(async (_path: string, body: any) => {
                capturedBodies.push(body);
                return { docs };
            }),
        };
        await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 5,
            initialSync: true,
            httpService: http as any,
        });
        expect(syncList.value[0].eof).toBe(true);
        expect(capturedBodies[0].identifier).toBe("sync");
    });

    it("recurses when eof false then merges vertically on second batch", async () => {
        // First batch full (eof false), second batch shorter (eof true) and adjacent for merge
        const first = makeDocs(5, 5000, 1); // 5000..4996
        const second = makeDocs(2, 4996, 1); // 4996..4995 (adjacent to first.blockEnd 4996)
        const http = { post: vi.fn() };
        http.post
            .mockImplementationOnce(async () => ({ docs: first }))
            .mockImplementationOnce(async () => ({ docs: second }));
        await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 5,
            initialSync: true,
            httpService: http as any,
        });
        // Two calls due to recursion
        expect(http.post).toHaveBeenCalledTimes(2);
        // After vertical merges only one chunk should remain (merged)
        expect(syncList.value.length).toBe(1);
        expect(syncList.value[0].blockStart).toBe(first[0].updatedTimeUtc);
        // blockEnd is extended to 0 (the queried lower bound) since eof was reached,
        // indicating we've verified no more data exists in the full queried range
        expect(syncList.value[0].blockEnd).toBe(0);
        expect(syncList.value[0].eof).toBe(true);
    });

    it("performs horizontal merge when vertical merge reports eof and multiple groups present", async () => {
        // Two groups interleaved: we simulate syncBatch twice manually to avoid complexity
        const docsA = makeDocs(2, 2000, 10);
        const docsB = makeDocs(1, 1990, 10);
        const http = { post: vi.fn(async () => ({ docs: docsA })) };
        await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 3,
            initialSync: true,
            httpService: http as any,
        });
        // Manually push second group's chunk then trigger vertical+horizontal via syncBatch call
        http.post.mockImplementation(async () => ({ docs: docsB }));
        await syncBatch({
            type: DocType.Post,
            memberOf: ["g2"],
            limit: 3,
            initialSync: true,
            httpService: http as any,
        });
        // After second call horizontal merge should combine groups
        expect(syncList.value.length).toBe(1);
        expect(syncList.value[0].memberOf.sort()).toEqual(["g1", "g2"].sort());
    });

    it("upserts fetched docs to IndexedDB (first batch)", async () => {
        const docs = makeDocs(2, 1000, 5);
        const http = { post: vi.fn(async () => ({ docs })) };
        await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 10,
            initialSync: true,
            httpService: http as any,
        });
        const bulkPutSpy = (db as any).bulkPut;
        expect(bulkPutSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(bulkPutSpy.mock.calls[0][0]).toEqual(docs);
    });

    it("handles empty docs response using Date.now() as blockStart for initial top-of-range query", async () => {
        vi.useFakeTimers();
        const now = new Date("2024-01-01").getTime();
        vi.setSystemTime(now);

        const http = { post: vi.fn(async () => ({ docs: [] })) };
        await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 5,
            initialSync: true,
            httpService: http as any,
        });
        // Empty top-of-range queries use Date.now() so subsequent syncs can find docs
        // created after this empty sync (avoids blockEnd ≈ MAX_SAFE_INTEGER on next run)
        expect(syncList.value.length).toBe(1);
        expect(syncList.value[0].blockStart).toBe(now);
        expect(syncList.value[0].blockEnd).toBe(0);

        vi.useRealTimers();
    });

    it("throws error on invalid docs format", async () => {
        const http = { post: vi.fn(async () => ({ docs: "bad" })) };
        await expect(
            syncBatch({
                type: DocType.Post,
                memberOf: ["g1"],
                limit: 5,
                initialSync: true,
                httpService: http as any,
            }),
        ).rejects.toThrow("Invalid API response format");
    });

    it("returns mergeResult with eof, blockStart, and blockEnd", async () => {
        const docs = makeDocs(3, 3000, 10);
        const http = { post: vi.fn(async () => ({ docs })) };
        const result = await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 5,
            initialSync: true,
            httpService: http as any,
        });

        expect(result).toBeDefined();
        expect(result?.eof).toBe(true);
        expect(result?.blockStart).toBe(docs[0].updatedTimeUtc);
        // blockEnd extends to the queried lower bound (0) since eof was reached
        expect(result?.blockEnd).toBe(0);
    });

    it("returns mergeResult after recursion with final eof state", async () => {
        const first = makeDocs(5, 5000, 1);
        const second = makeDocs(2, 4996, 1);
        const http = { post: vi.fn() };
        http.post
            .mockImplementationOnce(async () => ({ docs: first }))
            .mockImplementationOnce(async () => ({ docs: second }));

        const result = await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 5,
            initialSync: true,
            httpService: http as any,
        });

        expect(result).toBeDefined();
        // First call: eof: false since first batch is full (5 docs = limit)
        // Recursive call returns the final merged result with eof: true
        expect(result?.eof).toBe(true);
        expect(result?.blockStart).toBe(first[0].updatedTimeUtc);
        // blockEnd is extended to 0 (the queried lower bound) since eof was reached
        expect(result?.blockEnd).toBe(0);
    });

    it("updates blockStart and blockEnd from horizontal merge when eof=true", async () => {
        // First group reaches EOF
        const docsA = makeDocs(2, 2000, 10);
        const http = { post: vi.fn(async () => ({ docs: docsA })) };
        await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 3,
            initialSync: true,
            httpService: http as any,
        });

        // Second group also reaches EOF - should trigger horizontal merge
        const docsB = makeDocs(1, 1990, 10);
        http.post.mockImplementation(async () => ({ docs: docsB }));
        const resultB = await syncBatch({
            type: DocType.Post,
            memberOf: ["g2"],
            limit: 3,
            initialSync: true,
            httpService: http as any,
        });

        // After horizontal merge, blockStart should be max and blockEnd should be min
        expect(resultB).toBeDefined();
        expect(resultB?.eof).toBe(true);
        // blockStart should be max of both groups
        expect(resultB?.blockStart).toBe(
            Math.max(docsA[0].updatedTimeUtc, docsB[0].updatedTimeUtc),
        );
        // blockEnd extends to 0 (the queried lower bound) since both groups reached eof
        expect(resultB?.blockEnd).toBe(0);
    });

    it("returns undefined when cancelSync is set before starting", async () => {
        setCancelSync(true);
        const http = { post: vi.fn() };
        const result = await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 10,
            initialSync: true,
            httpService: http as any,
        });
        expect(result).toBeUndefined();
        setCancelSync(false);
    });

    it("returns mergeResult with Date.now() as blockStart for empty initial sync", async () => {
        vi.useFakeTimers();
        const now = new Date("2024-01-01").getTime();
        vi.setSystemTime(now);

        const http = { post: vi.fn(async () => ({ docs: [] })) };
        const result = await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 5,
            initialSync: true,
            httpService: http as any,
        });

        expect(result).toBeDefined();
        expect(result?.eof).toBe(true);
        // Empty initial sync uses Date.now() so subsequent syncs compute a real blockEnd
        expect(result?.blockStart).toBe(now);
        expect(result?.blockEnd).toBe(0);

        vi.useRealTimers();
    });

    it("returns mergeResult for content type with languages", async () => {
        const docs = makeDocs(3, 3000, 10);
        const http = { post: vi.fn(async () => ({ docs })) };
        const result = await syncBatch({
            type: DocType.Content,
            subType: DocType.Post,
            memberOf: ["g1"],
            languages: ["en", "es"],
            limit: 5,
            initialSync: true,
            httpService: http as any,
        });

        expect(result).toBeDefined();
        expect(result?.eof).toBe(true);
        expect(result?.blockStart).toBe(docs[0].updatedTimeUtc);
        // blockEnd extends to the queried lower bound (0) since eof was reached
        expect(result?.blockEnd).toBe(0);
    });

    it("returns firstSync=true when initialSync is true and no existing chunks", async () => {
        const docs = makeDocs(3, 3000, 10);
        const http = { post: vi.fn(async () => ({ docs })) };
        const result = await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 5,
            initialSync: true,
            httpService: http as any,
        });

        expect(result).toBeDefined();
        expect(result?.firstSync).toBe(true);
    });

    it("returns firstSync=false when blockEnd is not 0", async () => {
        // Add two existing chunks so blockEnd won't be 0
        syncList.value.push({
            chunkType: "post",
            memberOf: ["g1"],
            blockStart: 5000,
            blockEnd: 4000,
            eof: false,
        });
        syncList.value.push({
            chunkType: "post",
            memberOf: ["g1"],
            blockStart: 4000,
            blockEnd: 3000,
            eof: false,
        });

        const docs = makeDocs(3, 3999, 10);
        const http = { post: vi.fn(async () => ({ docs })) };
        const result = await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 5,
            initialSync: false,
            httpService: http as any,
        });

        expect(result).toBeDefined();
        expect(result?.firstSync).toBe(false);
    });

    it("returns firstSync=true when blockEnd is 0 (reaching end of data)", async () => {
        // Add existing chunks that will result in blockEnd=0
        syncList.value.push({
            chunkType: "post",
            memberOf: ["g1"],
            blockStart: 5000,
            blockEnd: 1000,
            eof: false,
        });

        const docs = makeDocs(2, 999, 10); // [999, 989] — fills data below 1000
        // After the first batch, two non-adjacent blocks exist: {5000,1000} and {999,0}.
        // A gap-filling batch queries the narrow [999,1000] range. Returning empty docs
        // lets syncBatch insert a boundary chunk {1000,999} that bridges the blocks and merges them.
        const http = { post: vi.fn() };
        http.post
            .mockImplementationOnce(async () => ({ docs })) // First call: continuation data
            .mockImplementationOnce(async () => ({ docs: [] })); // Second call: gap has no docs
        const result = await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 5,
            initialSync: false,
            httpService: http as any,
        });

        expect(result).toBeDefined();
        // When there's only one chunk in syncList for this type/memberOf, blockEnd becomes 0
        expect(result?.firstSync).toBe(true);
    });

    it("continues syncing older data after resume when catch-up returns few docs", async () => {
        // Simulate interrupted sync: existing chunk covers 5000→3000, eof not reached
        syncList.value.push({
            chunkType: "post",
            memberOf: ["g1"],
            blockStart: 5000,
            blockEnd: 3000,
            eof: false,
        });

        // Catch-up batch returns 2 new docs (eof=true since 2 < limit)
        const catchUpDocs = makeDocs(2, 5500, 100); // 5500, 5400
        // Continuation batch returns older docs starting at the boundary (3000) for proper overlap merge
        const olderDocs = makeDocs(3, 3000, 500); // 3000, 2500, 2000
        const http = { post: vi.fn() };
        http.post
            .mockImplementationOnce(async () => ({ docs: catchUpDocs }))
            .mockImplementationOnce(async () => ({ docs: olderDocs }));

        const result = await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 5,
            initialSync: true,
            httpService: http as any,
        });

        // Should have made 2 API calls: catch-up + continuation for older data
        expect(http.post).toHaveBeenCalledTimes(2);
        expect(result).toBeDefined();
        expect(result?.eof).toBe(true);
    });

    it("fetches all new docs when reconnecting after long disconnect with more new docs than the batch limit", async () => {
        // Regression test: before the fix, the second batch computed an inverted range
        // ([0, T_new]) and stopped prematurely, leaving a gap of unfetched documents.
        //
        // Scenario: all docs up to timestamp 1000 are synced (complete block).
        // While offline, 5 new docs were published (timestamps 5000→2000).
        // Batch limit is 3, so batch 1 fetches top 3 (5000, 4000, 3000) and batch 2
        // must fill the gap [1000, 3000] to retrieve the remaining doc (2000).
        syncList.value.push({
            chunkType: "post",
            memberOf: ["g1"],
            blockStart: 1000,
            blockEnd: 0,
            eof: true, // All docs ≤ 1000 are synced
        });

        // Batch 1: top 3 new docs (at limit → eof=false, gap remains)
        const catchUpBatch = [5000, 4000, 3000].map((ts, i) => ({
            id: `doc-${i}`,
            type: DocType.Post,
            updatedTimeUtc: ts,
            memberOf: ["g1"],
        }));
        // Batch 2: gap-filling docs including overlap at 3000 (eof=true since 2 < limit)
        const gapBatch = [3000, 2000].map((ts, i) => ({
            id: `doc-gap-${i}`,
            type: DocType.Post,
            updatedTimeUtc: ts,
            memberOf: ["g1"],
        }));

        const http = { post: vi.fn() };
        http.post
            .mockImplementationOnce(async () => ({ docs: catchUpBatch }))
            .mockImplementationOnce(async () => ({ docs: gapBatch }));

        const result = await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 3,
            initialSync: true,
            httpService: http as any,
        });

        // Both batches must be fetched — old code stopped after 1 due to inverted range
        expect(http.post).toHaveBeenCalledTimes(2);

        // The gap doc (2000) must have been stored via db.bulkPut
        const allStoredDocs = (db.bulkPut as ReturnType<typeof vi.fn>).mock.calls.flatMap(
            (call) => call[0],
        );
        const storedTimestamps = allStoredDocs.map((d: any) => d.updatedTimeUtc);
        expect(storedTimestamps).toContain(2000);

        // Final result must be fully synced (eof=true, one merged block)
        expect(result?.eof).toBe(true);
        expect(syncList.value.length).toBe(1);
        expect(syncList.value[0].blockStart).toBe(5000);
        expect(syncList.value[0].blockEnd).toBe(0);
    });

    it("finds docs created after initial empty sync on second sync (group membership bug fix)", async () => {
        // Regression test: when a type (e.g. groups) is synced before any docs exist,
        // the syncList gets {blockStart: Date.now(), blockEnd: 0, eof: true}.
        // When docs are later created on the server, the next sync must find them.
        // Before the fix, blockStart was MAX_SAFE_INTEGER, so blockEnd = MAX_SAFE_INT - 1000
        // and real documents (at normal timestamps) were never found.

        vi.useFakeTimers();
        const firstSyncTime = new Date("2023-01-01").getTime();
        vi.setSystemTime(firstSyncTime);

        // First sync: no docs exist yet (e.g. no groups configured)
        const http = { post: vi.fn(async () => ({ docs: [] })) };
        await syncBatch({
            type: DocType.Group,
            memberOf: ["g1"],
            limit: 5,
            initialSync: true,
            httpService: http as any,
        });

        // Confirm syncList uses Date.now(), not MAX_SAFE_INTEGER
        expect(syncList.value[0].blockStart).toBe(firstSyncTime);

        // Docs are now created on the server (after the initial empty sync)
        const laterTimestamp = firstSyncTime + 60_000; // 1 minute later
        const newDocs = [
            { id: "group-1", type: DocType.Group, updatedTimeUtc: laterTimestamp, memberOf: ["g1"] },
        ] as any;

        // Advance time to simulate a later session
        vi.setSystemTime(firstSyncTime + 3_600_000); // 1 hour later
        http.post.mockImplementation(async () => ({ docs: newDocs }));

        await syncBatch({
            type: DocType.Group,
            memberOf: ["g1"],
            limit: 5,
            initialSync: true,
            httpService: http as any,
        });

        // The new doc must have been stored
        const allStored = (db.bulkPut as ReturnType<typeof vi.fn>).mock.calls.flatMap(
            (call) => call[0],
        );
        expect(allStored.some((d: any) => d.id === "group-1")).toBe(true);

        vi.useRealTimers();
    });

    it("continues syncing older data after resume when catch-up returns no docs", async () => {
        // Simulate interrupted sync: existing chunk covers 5000→3000, eof not reached
        syncList.value.push({
            chunkType: "post",
            memberOf: ["g1"],
            blockStart: 5000,
            blockEnd: 3000,
            eof: false,
        });

        // Catch-up returns no new docs (no updates since interruption)
        // Continuation returns remaining older docs
        const olderDocs = makeDocs(3, 3000, 500); // 3000, 2500, 2000
        const http = { post: vi.fn() };
        http.post
            .mockImplementationOnce(async () => ({ docs: [] }))
            .mockImplementationOnce(async () => ({ docs: olderDocs }));

        const result = await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 5,
            initialSync: true,
            httpService: http as any,
        });

        // Should have made 2 API calls: empty catch-up + continuation for older data
        expect(http.post).toHaveBeenCalledTimes(2);
        expect(result).toBeDefined();
        expect(result?.eof).toBe(true);
    });
});
