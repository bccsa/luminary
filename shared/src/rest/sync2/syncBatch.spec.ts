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
        expect(syncList.value[0].blockEnd).toBe(second[second.length - 1].updatedTimeUtc);
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

    it("handles empty docs response and sets blockStart/blockEnd to 0", async () => {
        const http = { post: vi.fn(async () => ({ docs: [] })) };
        const result = await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 5,
            initialSync: true,
            httpService: http as any,
        });
        expect(syncList.value.length).toBe(0);
        expect(result?.eof).toBe(true);
        expect(result?.blockStart).toBe(0);
        expect(result?.blockEnd).toBe(0);
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
        expect(result?.blockEnd).toBe(docs[docs.length - 1].updatedTimeUtc);
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
        // Now the return value is from the recursive call which has eof: true (after merging)
        expect(result?.eof).toBe(true);
        expect(result?.blockStart).toBe(first[0].updatedTimeUtc);
        // blockEnd is from the merged result (both batches merged)
        expect(result?.blockEnd).toBe(second[second.length - 1].updatedTimeUtc);
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
        // blockEnd should be min of both groups
        expect(resultB?.blockEnd).toBe(
            Math.min(
                docsA[docsA.length - 1].updatedTimeUtc,
                docsB[docsB.length - 1].updatedTimeUtc,
            ),
        );
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

    it("returns mergeResult with blockStart=0 and blockEnd=0 for empty docs", async () => {
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
        expect(result?.blockStart).toBe(0);
        expect(result?.blockEnd).toBe(0);
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
        expect(result?.blockEnd).toBe(docs[docs.length - 1].updatedTimeUtc);
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

        const docs = makeDocs(2, 999, 10);
        const http = { post: vi.fn(async () => ({ docs })) };
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
});
