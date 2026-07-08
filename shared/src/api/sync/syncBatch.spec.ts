import { describe, it, expect, beforeEach, vi } from "vitest";
import { syncBatch } from "./syncBatch";
import { setCancelSync } from "./sync";
import { syncList } from "./state";
import { DocType, BaseDocumentDto } from "../../types";
import { OPEN_MAX, OPEN_MIN } from "./utils";

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

    // A single chunk already walked to the floor leaves calcChunk's downward continuation with
    // blockStart === blockEnd === 0, producing a `{ $lte: 0, $gte: 0 }` selector that can never
    // match. Seal the column instead of spending the round trip.
    it("seals the column instead of querying when the continuation range is at the floor", async () => {
        syncList.value = [
            { chunkType: "redirect", memberOf: ["g1"], blockStart: 5000, blockEnd: 0, eof: false },
        ];
        const http = { post: vi.fn() };

        const res = await syncBatch({
            type: DocType.Redirect,
            memberOf: ["g1"],
            limit: 500,
            initialSync: false, // downward continuation → calcChunk yields { 0, 0 }
            httpService: http as any,
        });

        expect(http.post).not.toHaveBeenCalled();
        expect(res?.eof).toBe(true);
        expect(syncList.value[0]!.eof).toBe(true); // sealed on the stored entry, not just the result
    });

    // A permission failure (e.g. 403 from a missing CmsView grant) makes HttpReq return undefined.
    // That must surface as a named error, not an opaque TypeError on `res.docs`.
    it("throws a request-failed error when the query response is undefined (4xx/network)", async () => {
        const http = { post: vi.fn(async () => undefined) };
        await expect(
            syncBatch({
                type: DocType.Post,
                memberOf: ["g1"],
                limit: 10,
                initialSync: true,
                httpService: http as any,
            }),
        ).rejects.toThrow(/Query request failed/);
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
        // Non-CMS content uses the set-based priority-fallback keep ($or), NOT a flat $in: the
        // first branch is the synced-language membership, the second is the last-resort fallback
        // (one negated availableTranslations elemMatch per synced language).
        expect(body.selector.language).toBeUndefined();
        expect(body.selector.$or[0].language.$in).toEqual(languages);
        expect(
            body.selector.$or[1].$and.map((c: any) => c.$not.availableTranslations.$elemMatch.$eq),
        ).toEqual(languages);
        expect(body.identifier).toBe("sync");
        // Content uses the de-partitioned single index regardless of parentType.
        expect(body.use_index).toBe("sync-content-index");
    });

    it("uses a flat language $in for CMS content sync (no fallback keep)", async () => {
        const docs = makeDocs(5, 5000, 10);
        const capturedBodies: any[] = [];
        const http = {
            post: vi.fn(async (_path: string, body: any) => {
                capturedBodies.push(body);
                return { docs };
            }),
        };
        const languages = ["en", "es", "fr"];
        await syncBatch({
            type: DocType.Content,
            subType: DocType.Post,
            memberOf: ["g1"],
            limit: 10,
            initialSync: true,
            languages,
            cms: true,
            httpService: http as any,
        });
        const body = capturedBodies[0];
        // CMS syncs all available languages, so a flat membership is correct and the fallback
        // branch would be vacuous — no $or.
        expect(body.selector.$or).toBeUndefined();
        expect(body.selector.language.$in).toEqual(languages);
    });

    it("matches nothing (language $in []) for non-CMS content sync with an empty language set", async () => {
        const docs: any[] = [];
        const capturedBodies: any[] = [];
        const http = {
            post: vi.fn(async (_path: string, body: any) => {
                capturedBodies.push(body);
                return { docs };
            }),
        };
        await syncBatch({
            type: DocType.Content,
            subType: DocType.Post,
            memberOf: ["g1"],
            limit: 10,
            initialSync: true,
            languages: [],
            httpService: http as any,
        });
        const body = capturedBodies[0];
        // An absent language set must match nothing (never fetch the whole corpus).
        expect(body.selector.$or).toBeUndefined();
        expect(body.selector.language.$in).toEqual([]);
    });

    it("builds mango query for deleteCmd type: docType only, NO language selector (unscoped)", async () => {
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
        // DeleteCmds are language-UNSCOPED: even when a language set is passed, no language selector
        // is added, so a delete of any downloaded doc (incl. a non-synced fallback) propagates.
        expect(body.selector.language).toBeUndefined();
        // DeleteCmd index naming is unchanged (still per-docType).
        expect(body.use_index).toBe("sync-post-deleteCmd-index");
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

    it("sets includeExpired=true for Content update sync (existing entries, initialSync=true, non-CMS)", async () => {
        // Simulate existing sync entries so this is an update sync (blockEnd > 0)
        syncList.value.push({
            chunkType: "content:post",
            memberOf: ["g1"],
            languages: ["en"],
            blockStart: 5000,
            blockEnd: 3000,
            eof: true,
        });

        const capturedBodies: any[] = [];
        const http = {
            post: vi.fn(async (_path: string, body: any) => {
                capturedBodies.push(body);
                return { docs: [] };
            }),
        };
        await syncBatch({
            type: DocType.Content,
            subType: DocType.Post,
            memberOf: ["g1"],
            languages: ["en"],
            limit: 10,
            initialSync: true,
            cms: false,
            httpService: http as any,
        });
        expect(capturedBodies[0].includeExpired).toBe(true);
    });

    it("does not set includeExpired for Content full initial sync (no existing entries)", async () => {
        const capturedBodies: any[] = [];
        const http = {
            post: vi.fn(async (_path: string, body: any) => {
                capturedBodies.push(body);
                return { docs: [] };
            }),
        };
        await syncBatch({
            type: DocType.Content,
            subType: DocType.Post,
            memberOf: ["g1"],
            languages: ["en"],
            limit: 10,
            initialSync: true,
            cms: false,
            httpService: http as any,
        });
        expect(capturedBodies[0].includeExpired).toBeUndefined();
    });

    it("does not set includeExpired for Content backwards-fill (initialSync=false)", async () => {
        syncList.value.push({
            chunkType: "content:post",
            memberOf: ["g1"],
            languages: ["en"],
            blockStart: 5000,
            blockEnd: 3000,
            eof: false,
        });

        const capturedBodies: any[] = [];
        const http = {
            post: vi.fn(async (_path: string, body: any) => {
                capturedBodies.push(body);
                return { docs: [] };
            }),
        };
        await syncBatch({
            type: DocType.Content,
            subType: DocType.Post,
            memberOf: ["g1"],
            languages: ["en"],
            limit: 10,
            initialSync: false,
            cms: false,
            httpService: http as any,
        });
        expect(capturedBodies[0].includeExpired).toBeUndefined();
    });

    it("does not set includeExpired for CMS Content update sync", async () => {
        syncList.value.push({
            chunkType: "content:post",
            memberOf: ["g1"],
            languages: ["en"],
            blockStart: 5000,
            blockEnd: 3000,
            eof: true,
        });

        const capturedBodies: any[] = [];
        const http = {
            post: vi.fn(async (_path: string, body: any) => {
                capturedBodies.push(body);
                return { docs: [] };
            }),
        };
        await syncBatch({
            type: DocType.Content,
            subType: DocType.Post,
            memberOf: ["g1"],
            languages: ["en"],
            limit: 10,
            initialSync: true,
            cms: true,
            httpService: http as any,
        });
        expect(capturedBodies[0].includeExpired).toBeUndefined();
    });

    it("does not set includeExpired for non-Content type update sync", async () => {
        syncList.value.push({
            chunkType: "post",
            memberOf: ["g1"],
            blockStart: 5000,
            blockEnd: 3000,
            eof: true,
        });

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
            httpService: http as any,
        });
        expect(capturedBodies[0].includeExpired).toBeUndefined();
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

    it("handles empty docs response without pushing a chunk", async () => {
        const http = { post: vi.fn(async () => ({ docs: [] })) };
        await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 5,
            initialSync: true,
            httpService: http as any,
        });
        // Empty responses should not push a chunk to avoid storing sentinel values
        // like MAX_SAFE_INTEGER. The loop terminates via early repetition detection.
        expect(syncList.value.length).toBe(0);
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

    it("returns mergeResult with queried boundaries for empty docs", async () => {
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
        // Empty responses don't push a chunk; merge returns {0, 0} for an empty syncList
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

    it("does NOT prematurely mark eof on a publishDate-bounded column's catch-up window", async () => {
        // Regression for the rebase interaction between main's tightened EOF rule
        // (`< limit && chunk.blockEnd === 0`) and our publishDate gap columns.
        // Setup: a publishDate-bounded column [500..999] was syncing backwards and
        // paused mid-sync (blockEnd > 0, eof: false). On resume, the catch-up
        // batch returns only 2 docs (< limit) above the existing blockStart — but
        // chunk.blockEnd from calcChunk is non-zero (it's the catch-up window
        // floor, not the timeline floor). Under the OLD rule (< limit alone) this
        // batch would falsely seal eof and leave the older window un-fetched.
        // Under main's tightening the column must continue to a real floor.
        syncList.value.push({
            chunkType: "content:post",
            memberOf: ["g1"],
            languages: ["en"],
            blockStart: 5000,
            blockEnd: 3000,
            eof: false,
            publishDateMin: 500,
            publishDateMax: 999,
        });

        const catchUp = makeDocs(2, 5500, 100); // < limit; catch-up window
        const tail = makeDocs(3, 3000, 500); // continuation; reaches floor 0
        const http = { post: vi.fn() };
        http.post
            .mockImplementationOnce(async () => ({ docs: catchUp }))
            .mockImplementationOnce(async () => ({ docs: tail }));

        const result = await syncBatch({
            type: DocType.Content,
            subType: DocType.Post,
            memberOf: ["g1"],
            languages: ["en"],
            limit: 5,
            initialSync: true,
            publishDateMin: 500,
            publishDateMax: 999,
            httpService: http as any,
        });

        // Catch-up did NOT seal eof — continuation ran. Two API calls.
        expect(http.post).toHaveBeenCalledTimes(2);
        expect(result?.eof).toBe(true);
        // publishDate bounds preserved on the (merged) column entry.
        const final = syncList.value.find((e) => e.chunkType === "content:post");
        expect(final?.publishDateMin).toBe(500);
        expect(final?.publishDateMax).toBe(999);
    });

    // --- Loop termination / regression tests ---

    it("terminates without infinite loop when initial sync returns no docs (empty database)", async () => {
        // This is the primary bug scenario: no documents exist for this type,
        // so the API always returns []. Without loop detection, calcChunk would
        // keep returning {MAX_SAFE_INTEGER, 0} and recurse forever.
        const http = { post: vi.fn(async () => ({ docs: [] })) };
        const result = await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 5,
            initialSync: true,
            httpService: http as any,
        });

        // Must only call the API once — the repetition detection should stop it
        expect(http.post).toHaveBeenCalledTimes(1);
        expect(result).toBeDefined();
        expect(result?.eof).toBe(true);
        // No chunks should be stored
        expect(syncList.value.length).toBe(0);
    });

    it("terminates when continuation into an empty range returns no docs", async () => {
        // Existing chunk hasn't reached eof, but there's genuinely no older data.
        // Without loop detection, the continuation query {3000, 0} would repeat forever.
        syncList.value.push({
            chunkType: "post",
            memberOf: ["g1"],
            blockStart: 5000,
            blockEnd: 3000,
            eof: false,
        });

        // Catch-up returns a few new docs (merges with existing chunk, eof still false)
        const catchUpDocs = makeDocs(2, 6000, 100); // 6000, 5900
        const http = { post: vi.fn() };
        http.post
            .mockImplementationOnce(async () => ({ docs: catchUpDocs }))
            // Continuation below 3000 returns nothing — no older data exists
            .mockImplementationOnce(async () => ({ docs: [] }));

        const result = await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 5,
            initialSync: true,
            httpService: http as any,
        });

        // 2 API calls: catch-up + one empty continuation, then terminates
        expect(http.post).toHaveBeenCalledTimes(2);
        expect(result).toBeDefined();
        expect(result?.eof).toBe(true);
    });

    it("does not store MAX_SAFE_INTEGER in syncList for empty initial sync", async () => {
        const http = { post: vi.fn(async () => ({ docs: [] })) };
        await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 5,
            initialSync: true,
            httpService: http as any,
        });

        // Verify no chunk with MAX_SAFE_INTEGER was stored
        const hasMaxSafe = syncList.value.some(
            (entry) => entry.blockStart === Number.MAX_SAFE_INTEGER,
        );
        expect(hasMaxSafe).toBe(false);
    });

    it("terminates when both catch-up and continuation return no docs", async () => {
        // Interrupted sync with existing chunk; both catch-up and continuation are empty
        syncList.value.push({
            chunkType: "post",
            memberOf: ["g1"],
            blockStart: 5000,
            blockEnd: 3000,
            eof: false,
        });

        const http = { post: vi.fn(async () => ({ docs: [] })) };
        const result = await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 5,
            initialSync: true,
            httpService: http as any,
        });

        // Catch-up is empty → range shifts (initialSync changes), continuation is empty → terminates
        expect(http.post).toHaveBeenCalledTimes(2);
        expect(result).toBeDefined();
        expect(result?.eof).toBe(true);
    });

    it("does NOT short-circuit eof from the inverted-range guard when the inversion is much wider than syncTolerance", async () => {
        // Regression for the dual-column drift scenario. With two same-key columns
        // sitting at distinct updatedTimeUtc windows in syncList, calcChunk's
        // continuation-mode output is an inverted, very wide range:
        //   blockStart = list[0].blockEnd, blockEnd = list[1].blockStart.
        // The original inverted-range guard (`if (blockStart < blockEnd)`) treated
        // this as a tiny sub-tolerance boundary gap and called markColumnEof on
        // the frontier — falsely sealing a column that hadn't actually fetched the
        // ~5.95-day gap below. The widened guard only short-circuits when the
        // inversion is within `syncTolerance`; here it falls through and lets the
        // downstream stall guard (which terminates after one API call) handle it.
        syncList.value = [
            { chunkType: "post", memberOf: ["g1"], blockStart: 5000, blockEnd: 0, eof: true },
            {
                chunkType: "post",
                memberOf: ["g1"],
                blockStart: 12000,
                blockEnd: 11000,
                eof: false,
            },
        ];

        const http = { post: vi.fn(async () => ({ docs: [] })) };
        await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 5,
            initialSync: false, // forces calcChunk's continuation-mode (the inverted-wide case)
            httpService: http as any,
        });

        // Old behaviour: http.post was NEVER called (the inverted-range guard
        // short-circuited before any query). New behaviour: the guard's
        // `syncTolerance` gate stops short-circuiting on wide inversions, so
        // the runner reaches the POST step at least once.
        expect(http.post).toHaveBeenCalled();
    });

    it("terminates when docs are returned but chunk range does not advance (same-timestamp docs)", async () => {
        // All docs have the same updatedTimeUtc, so blockStart === blockEnd after fetch.
        // Without the widened stall guard, this would loop forever because blockLength > 0
        // and the old guard only checked blockLength === 0.
        const sameTimestampDocs = Array.from({ length: 5 }, (_, i) => ({
            id: `doc-${i}`,
            type: DocType.Post,
            updatedTimeUtc: 3000, // all identical
            memberOf: ["g1"],
        })) as any;

        const http = { post: vi.fn(async () => ({ docs: sameTimestampDocs })) };
        const result = await syncBatch({
            type: DocType.Post,
            memberOf: ["g1"],
            limit: 5, // blockLength === limit, so eof is false
            initialSync: true,
            httpService: http as any,
        });

        // Should terminate after detecting the range hasn't moved, not loop forever
        expect(http.post).toHaveBeenCalledTimes(2); // initial + one retry that detects stall
        expect(result).toBeDefined();
        expect(result?.eof).toBe(true);
    });

    // --- publishDate selector injection (Part A) ---

    describe("publishDate selector", () => {
        function makeContentDocs(count: number): BaseDocumentDto[] {
            return Array.from({ length: count }, (_, i) => ({
                id: `c-${i}`,
                type: DocType.Content,
                parentType: DocType.Post,
                language: "en",
                updatedTimeUtc: 5000 - i,
                memberOf: ["g1"],
            })) as any;
        }

        it("does NOT inject publishDate selector when both bounds are at defaults (byte-identical wire format)", async () => {
            const docs = makeContentDocs(2);
            const capturedBodies: any[] = [];
            const http = {
                post: vi.fn(async (_path: string, body: any) => {
                    capturedBodies.push(body);
                    return { docs };
                }),
            };
            await syncBatch({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["g1"],
                languages: ["en"],
                limit: 10,
                initialSync: true,
                httpService: http as any,
                publishDateMin: OPEN_MIN,
                publishDateMax: OPEN_MAX,
            });
            // Regression: when at defaults the selector must look identical to a call
            // that didn't even know about publishDate.
            expect(capturedBodies[0].selector.publishDate).toBeUndefined();
            // Non-CMS content carries the language keep as a top-level `$or` (not a `language` key).
            expect(Object.keys(capturedBodies[0].selector).sort()).toEqual(
                ["$or", "memberOf", "parentType", "type", "updatedTimeUtc"].sort(),
            );
        });

        it("does NOT inject publishDate selector when publishDate options are completely absent", async () => {
            const docs = makeContentDocs(2);
            const capturedBodies: any[] = [];
            const http = {
                post: vi.fn(async (_path: string, body: any) => {
                    capturedBodies.push(body);
                    return { docs };
                }),
            };
            await syncBatch({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["g1"],
                languages: ["en"],
                limit: 10,
                initialSync: true,
                httpService: http as any,
            });
            expect(capturedBodies[0].selector.publishDate).toBeUndefined();
        });

        it("injects $gte only when publishDateMin is narrowed", async () => {
            const docs = makeContentDocs(2);
            const capturedBodies: any[] = [];
            const http = {
                post: vi.fn(async (_path: string, body: any) => {
                    capturedBodies.push(body);
                    return { docs };
                }),
            };
            await syncBatch({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["g1"],
                languages: ["en"],
                limit: 10,
                initialSync: true,
                httpService: http as any,
                publishDateMin: 1000,
                publishDateMax: OPEN_MAX,
            });
            expect(capturedBodies[0].selector.publishDate).toEqual({ $gte: 1000 });
        });

        it("injects $lte only when publishDateMax is narrowed", async () => {
            const docs = makeContentDocs(2);
            const capturedBodies: any[] = [];
            const http = {
                post: vi.fn(async (_path: string, body: any) => {
                    capturedBodies.push(body);
                    return { docs };
                }),
            };
            await syncBatch({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["g1"],
                languages: ["en"],
                limit: 10,
                initialSync: true,
                httpService: http as any,
                publishDateMin: OPEN_MIN,
                publishDateMax: 5000,
            });
            expect(capturedBodies[0].selector.publishDate).toEqual({ $lte: 5000 });
        });

        it("injects both $gte and $lte when both bounds are narrowed", async () => {
            const docs = makeContentDocs(2);
            const capturedBodies: any[] = [];
            const http = {
                post: vi.fn(async (_path: string, body: any) => {
                    capturedBodies.push(body);
                    return { docs };
                }),
            };
            await syncBatch({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["g1"],
                languages: ["en"],
                limit: 10,
                initialSync: true,
                httpService: http as any,
                publishDateMin: 1000,
                publishDateMax: 5000,
            });
            expect(capturedBodies[0].selector.publishDate).toEqual({ $gte: 1000, $lte: 5000 });
        });

        it("NEVER injects publishDate for DeleteCmd queries even when narrowed", async () => {
            const docs = Array.from({ length: 2 }, (_, i) => ({
                id: `d-${i}`,
                type: DocType.DeleteCmd,
                docType: DocType.Post,
                updatedTimeUtc: 5000 - i,
                memberOf: ["g1"],
            })) as any;
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
                // Even with narrowed bounds, DeleteCmd must NOT be filtered by publishDate
                // so deletes propagate regardless of the user's cutoff.
                publishDateMin: 1000,
                publishDateMax: 5000,
            });
            expect(capturedBodies[0].selector.publishDate).toBeUndefined();
        });

        it("does NOT inject publishDate for non-Content types (e.g. Post)", async () => {
            const docs = makeDocs(2, 5000, 10);
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
                limit: 10,
                initialSync: true,
                httpService: http as any,
                publishDateMin: 1000,
                publishDateMax: 5000,
            });
            expect(capturedBodies[0].selector.publishDate).toBeUndefined();
        });

        it("persists resolved publishDate bounds on the pushed syncList chunk (default callers)", async () => {
            const docs = makeContentDocs(2);
            const http = { post: vi.fn(async () => ({ docs })) };
            await syncBatch({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["g1"],
                languages: ["en"],
                limit: 10,
                initialSync: true,
                httpService: http as any,
            });
            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].publishDateMin).toBe(OPEN_MIN);
            expect(syncList.value[0].publishDateMax).toBe(OPEN_MAX);
        });

        it("persists narrowed publishDate bounds on the pushed syncList chunk", async () => {
            const docs = makeContentDocs(2);
            const http = { post: vi.fn(async () => ({ docs })) };
            await syncBatch({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["g1"],
                languages: ["en"],
                limit: 10,
                initialSync: true,
                httpService: http as any,
                publishDateMin: 1000,
                publishDateMax: 5000,
            });
            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].publishDateMin).toBe(1000);
            expect(syncList.value[0].publishDateMax).toBe(5000);
        });
    });
});
