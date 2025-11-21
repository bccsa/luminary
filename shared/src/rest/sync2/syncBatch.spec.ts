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
            type: "post",
            docType: DocType.Post,
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
            type: "content:post",
            docType: DocType.Content,
            parentType: DocType.Post,
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
            type: "post",
            docType: DocType.Post,
            memberOf: ["g1"],
            limit: 10,
            initialSync: true,
            cms: true,
            httpService: http as any,
        });
        const body = capturedBodies[0];
        expect(body.selector.cms).toBe(true);
    });

    it("marks eof true when returned docs length < limit", async () => {
        const docs = makeDocs(3, 3000, 10); // limit will be 5
        const http = { post: vi.fn(async () => ({ docs })) };
        await syncBatch({
            type: "post",
            docType: DocType.Post,
            memberOf: ["g1"],
            limit: 5,
            initialSync: true,
            httpService: http as any,
        });
        expect(syncList.value[0].eof).toBe(true);
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
            type: "post",
            docType: DocType.Post,
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
            type: "post",
            docType: DocType.Post,
            memberOf: ["g1"],
            limit: 3,
            initialSync: true,
            httpService: http as any,
        });
        // Manually push second group's chunk then trigger vertical+horizontal via syncBatch call
        http.post.mockImplementation(async () => ({ docs: docsB }));
        await syncBatch({
            type: "post",
            docType: DocType.Post,
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
            type: "post",
            docType: DocType.Post,
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
        await syncBatch({
            type: "post",
            docType: DocType.Post,
            memberOf: ["g1"],
            limit: 5,
            initialSync: true,
            httpService: http as any,
        });
        expect(syncList.value.length).toBe(1);
        expect(syncList.value[0].blockStart).toBe(0);
        expect(syncList.value[0].blockEnd).toBe(0);
    });

    it("throws error on invalid docs format", async () => {
        const http = { post: vi.fn(async () => ({ docs: "bad" })) };
        await expect(
            syncBatch({
                type: "post",
                docType: DocType.Post,
                memberOf: ["g1"],
                limit: 5,
                initialSync: true,
                httpService: http as any,
            }),
        ).rejects.toThrow("Invalid API response format");
    });
});
