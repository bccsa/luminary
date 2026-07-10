import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { initSync, sync, setCancelSync, cancelSync } from "./sync";
import { HttpReq } from "../http";
import { db } from "../../db/database";
import { evictStaleBelowCutoff } from "../../db/retention";
import { syncBatch } from "./syncBatch";
import { syncList } from "./state";
import { DocType } from "../../types";
import * as utils from "./utils";
import { OPEN_MAX, OPEN_MIN } from "./utils";
import { merge } from "./merge";
import { initConfig } from "../../config";

// Mock dependencies
vi.mock("../../db/database", () => ({
    db: {
        getSyncList: vi.fn(),
        setSyncList: vi.fn(),
        deleteExpired: vi.fn(),
    },
}));

vi.mock("../../db/retention", () => ({
    evictStaleBelowCutoff: vi.fn(),
}));

vi.mock("./syncBatch", () => ({
    syncBatch: vi.fn(),
}));

vi.mock("./trim", () => ({
    trim: vi.fn(),
}));

vi.mock("./merge", async () => {
    const actual = await vi.importActual("./merge");
    return {
        ...actual,
        merge: vi.fn(),
    };
});

vi.mock("./utils", async () => {
    const actual = await vi.importActual("./utils");
    return {
        ...actual,
        getGroups: vi.fn(),
        getGroupSets: vi.fn(),
        getLanguages: vi.fn(),
        getLanguageSets: vi.fn(),
    };
});

describe("sync module", () => {
    let mockHttpService: HttpReq<any>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockHttpService = new HttpReq("https://api.example.com", "test-token");
        syncList.value = [];
        // Reset cancelSync flag before each test
        setCancelSync(false);
    });

    afterEach(() => {
        // Ensure cancelSync is reset after each test
        setCancelSync(false);
    });

    describe("initSync", () => {
        it("should initialize sync module with HTTP service", async () => {
            vi.mocked(db.getSyncList).mockResolvedValue([]);

            await initSync(mockHttpService);

            expect(db.getSyncList).toHaveBeenCalledOnce();
        });

        it("should call db.getSyncList during initialization", async () => {
            vi.mocked(db.getSyncList).mockResolvedValue([]);

            await initSync(mockHttpService);

            expect(db.getSyncList).toHaveBeenCalled();
        });

        it("should keep a valid syncList", async () => {
            vi.mocked(db.getSyncList).mockResolvedValue([]);
            syncList.value = [
                { chunkType: "post", memberOf: ["g1"], blockStart: 5000, blockEnd: 0, eof: true },
                { chunkType: "tag", memberOf: ["g1"], blockStart: 5000, blockEnd: 0, eof: true },
            ];

            await initSync(mockHttpService);

            expect(syncList.value).toHaveLength(2);
            expect(db.setSyncList).not.toHaveBeenCalled();
        });

        it("should reset syncList when an entry has MAX_SAFE_INTEGER blockStart", async () => {
            vi.mocked(db.getSyncList).mockResolvedValue([]);
            syncList.value = [
                { chunkType: "post", memberOf: ["g1"], blockStart: 5000, blockEnd: 0, eof: true },
                {
                    chunkType: "post",
                    memberOf: ["g1"],
                    blockStart: Number.MAX_SAFE_INTEGER,
                    blockEnd: 0,
                    eof: true,
                },
            ];

            await initSync(mockHttpService);

            expect(syncList.value).toHaveLength(0);
            expect(db.setSyncList).toHaveBeenCalled();
        });

        it("should reset syncList when an entry has NaN block values", async () => {
            vi.mocked(db.getSyncList).mockResolvedValue([]);
            syncList.value = [
                { chunkType: "post", memberOf: ["g1"], blockStart: NaN, blockEnd: 0, eof: true },
            ];

            await initSync(mockHttpService);

            expect(syncList.value).toHaveLength(0);
            expect(db.setSyncList).toHaveBeenCalled();
        });

        it("should reset syncList when an entry has inverted range", async () => {
            vi.mocked(db.getSyncList).mockResolvedValue([]);
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["g1"],
                    blockStart: 1000,
                    blockEnd: 5000,
                    eof: true,
                },
            ];

            await initSync(mockHttpService);

            expect(syncList.value).toHaveLength(0);
            expect(db.setSyncList).toHaveBeenCalled();
        });

        it("should reset syncList when an entry has eof with narrow range (merge regression)", async () => {
            vi.mocked(db.getSyncList).mockResolvedValue([]);
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["g1"],
                    blockStart: 5000,
                    blockEnd: 4000,
                    eof: true,
                },
            ];

            await initSync(mockHttpService);

            expect(syncList.value).toHaveLength(0);
            expect(db.setSyncList).toHaveBeenCalled();
        });

        it("should keep valid eof entry with blockEnd=0", async () => {
            vi.mocked(db.getSyncList).mockResolvedValue([]);
            syncList.value = [
                { chunkType: "post", memberOf: ["g1"], blockStart: 5000, blockEnd: 0, eof: true },
            ];

            await initSync(mockHttpService);

            expect(syncList.value).toHaveLength(1);
            expect(db.setSyncList).not.toHaveBeenCalled();
        });

        it("should keep valid eof:false entry with narrow range (still syncing)", async () => {
            vi.mocked(db.getSyncList).mockResolvedValue([]);
            syncList.value = [
                {
                    chunkType: "post",
                    memberOf: ["g1"],
                    blockStart: 5000,
                    blockEnd: 4500,
                    eof: false,
                },
            ];

            await initSync(mockHttpService);

            expect(syncList.value).toHaveLength(1);
            expect(db.setSyncList).not.toHaveBeenCalled();
        });

        it("resolves legacy publishDate fields only on Content and DeleteCmd entries", async () => {
            vi.mocked(db.getSyncList).mockResolvedValue([]);
            // Three legacy entries (no publishDate fields), covering the three relevant cases:
            // Content (filled), DeleteCmd (filled — intentional OPEN coverage), and a non-Content
            // non-DeleteCmd chunkType (left untouched — publishDate has no meaning for it).
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["g1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 0,
                    eof: true,
                },
                {
                    chunkType: "deleteCmd:post",
                    memberOf: ["g1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 0,
                    eof: true,
                },
                {
                    chunkType: "language",
                    memberOf: ["g1"],
                    blockStart: 5000,
                    blockEnd: 0,
                    eof: true,
                },
            ];

            await initSync(mockHttpService);

            expect(syncList.value).toHaveLength(3);
            const byChunkType = Object.fromEntries(
                syncList.value.map((e) => [e.chunkType, e]),
            );
            // Content + DeleteCmd entries get filled.
            expect(byChunkType["content:post"].publishDateMin).toBe(OPEN_MIN);
            expect(byChunkType["content:post"].publishDateMax).toBe(OPEN_MAX);
            expect(byChunkType["deleteCmd:post"].publishDateMin).toBe(OPEN_MIN);
            expect(byChunkType["deleteCmd:post"].publishDateMax).toBe(OPEN_MAX);
            // The DeleteCmd migration also strips `languages` off legacy scoped entries so they
            // converge onto the language-UNSCOPED identity (deletes of any downloaded doc must
            // propagate regardless of synced languages). Content entries keep their `languages`.
            expect(byChunkType["deleteCmd:post"].languages).toBeUndefined();
            expect(byChunkType["content:post"].languages).toEqual(["en"]);
            // Non-Content non-DeleteCmd entry stays undefined — publishDate is dead weight there.
            expect(byChunkType["language"].publishDateMin).toBeUndefined();
            expect(byChunkType["language"].publishDateMax).toBeUndefined();
        });

        it("preserves explicit publishDate bounds on entries that already have them", async () => {
            vi.mocked(db.getSyncList).mockResolvedValue([]);
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["g1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 0,
                    eof: true,
                    publishDateMin: 1000,
                    publishDateMax: 5000,
                },
            ];

            await initSync(mockHttpService);

            expect(syncList.value).toHaveLength(1);
            expect(syncList.value[0].publishDateMin).toBe(1000);
            expect(syncList.value[0].publishDateMax).toBe(5000);
        });

        it("resets syncList when publishDateMin > publishDateMax (inverted range)", async () => {
            vi.mocked(db.getSyncList).mockResolvedValue([]);
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["g1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 0,
                    eof: true,
                    publishDateMin: 5000,
                    publishDateMax: 1000,
                },
            ];

            await initSync(mockHttpService);

            expect(syncList.value).toHaveLength(0);
            expect(db.setSyncList).toHaveBeenCalled();
        });

        it("resets syncList when publishDateMin is not a finite number", async () => {
            vi.mocked(db.getSyncList).mockResolvedValue([]);
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["g1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 0,
                    eof: true,
                    publishDateMin: NaN,
                    publishDateMax: 5000,
                },
            ];

            await initSync(mockHttpService);

            expect(syncList.value).toHaveLength(0);
            expect(db.setSyncList).toHaveBeenCalled();
        });

        it("resets syncList when publishDateMax is the wrong type", async () => {
            vi.mocked(db.getSyncList).mockResolvedValue([]);
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["g1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 0,
                    eof: true,
                    publishDateMin: 1000,
                    publishDateMax: "5000" as unknown as number,
                },
            ];

            await initSync(mockHttpService);

            expect(syncList.value).toHaveLength(0);
            expect(db.setSyncList).toHaveBeenCalled();
        });
    });

    describe("setCancelSync", () => {
        it("should set cancelSync to true", () => {
            setCancelSync(true);
            expect(cancelSync).toBe(true);
        });

        it("should set cancelSync to false", () => {
            setCancelSync(true);
            expect(cancelSync).toBe(true);

            setCancelSync(false);
            expect(cancelSync).toBe(false);
        });

        it("should allow sync to be cancelled and resumed", () => {
            setCancelSync(false);
            expect(cancelSync).toBe(false);

            setCancelSync(true);
            expect(cancelSync).toBe(true);

            setCancelSync(false);
            expect(cancelSync).toBe(false);
        });
    });

    describe("sync", () => {
        beforeEach(async () => {
            await initSync(mockHttpService);
            vi.mocked(syncBatch).mockResolvedValue(undefined);
        });

        it("should throw error if not initialized", async () => {
            // Force re-import to get uninitialized state
            vi.resetModules();
            const { sync: freshSync } = await import("./sync");

            await expect(
                freshSync({
                    type: DocType.Post,
                    memberOf: ["group1"],
                    languages: [],
                    limit: 100,
                }),
            ).rejects.toThrow("Sync module not initialized with HTTP service");
        });

        it("should call trim before starting sync", async () => {
            const { trim } = await import("./trim");
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);

            await sync({
                type: DocType.Post,
                memberOf: ["group1"],
                limit: 100,
                includeDeleteCmds: false,
            });

            // publishDate is only defaulted on Content callers; non-Content callers leave it
            // undefined (every code path that reads it wraps in `if (type === Content)`).
            expect(trim).toHaveBeenCalledWith({
                type: DocType.Post,
                memberOf: ["group1"],
                limit: 100,
                includeDeleteCmds: false,
            });
        });

        it("should return early if cancelSync is true", async () => {
            setCancelSync(true);

            await sync({
                type: DocType.Post,
                memberOf: ["group1"],
                languages: [],
                limit: 100,
                includeDeleteCmds: false,
            });

            expect(syncBatch).not.toHaveBeenCalled();
        });

        it("should call syncBatch with correct parameters for non-content type", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);

            await sync({
                type: DocType.Post,
                memberOf: ["group1"],
                limit: 100,
                includeDeleteCmds: false,
            });

            // Non-Content callers don't default publishDate — it stays undefined and downstream
            // comparators (resolveRange) treat that as the open range.
            expect(syncBatch).toHaveBeenCalledWith({
                type: DocType.Post,
                memberOf: ["group1"],
                limit: 100,
                includeDeleteCmds: false,
                initialSync: true,
                httpService: mockHttpService,
            });
        });

        it("should default includeDeleteCmds to true when not specified", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(syncBatch).mockResolvedValue({
                eof: true,
                blockStart: 5000,
                blockEnd: 3000,
                firstSync: false,
            });

            await sync({
                type: DocType.Post,
                memberOf: ["group1"],
                limit: 100,
            });

            // Should be called twice: once for main sync, once for DeleteCmd (because includeDeleteCmds defaults to true and firstSync=false)
            expect(syncBatch).toHaveBeenCalledTimes(2);
            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: DocType.Post,
                    includeDeleteCmds: true,
                }),
            );
            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: DocType.DeleteCmd,
                    subType: DocType.Post,
                }),
            );
        });

        it("should handle type with subType (content documents)", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(utils.getLanguages).mockReturnValue(["en"]);
            vi.mocked(utils.getLanguageSets).mockReturnValue([["en"]]);

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: false,
            });

            // Verify getGroupSets was called with the full options object
            expect(utils.getGroupSets).toHaveBeenCalledWith({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: false,
                publishDateMin: OPEN_MIN,
                publishDateMax: OPEN_MAX,
            });

            expect(syncBatch).toHaveBeenCalledWith({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: false,
                initialSync: true,
                httpService: mockHttpService,
                publishDateMin: OPEN_MIN,
                publishDateMax: OPEN_MAX,
            });
        });

        it("should start new runner for new languages when existing languages exist (content documents)", async () => {
            // Set up mocks to prevent recursion - return values that won't trigger recursive calls
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            // Return single group set to prevent group-based recursion
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);

            // Track calls to understand recursion: first call has ["en"], second call (recursive) has ["en", "fr"]
            let callCount = 0;
            vi.mocked(utils.getLanguages).mockImplementation(() => {
                callCount++;
                // First call (initial): existing is ["en"]
                // Second call (recursive with ["fr"]): existing is ["en", "fr"] to prevent further recursion
                return callCount === 1 ? ["en"] : ["en", "fr"];
            });

            // Mock getLanguageSets to return existing language set on first call, then single set to stop recursion
            let langSetCallCount = 0;
            vi.mocked(utils.getLanguageSets).mockImplementation(() => {
                langSetCallCount++;
                // First call: return ["en"] as existing language set
                // Subsequent calls: return combined set to stop recursion
                return langSetCallCount === 1 ? [["en"]] : [["en", "fr"]];
            });

            // Mock return values: existing language returns firstSync=false, DeleteCmd call, new language returns firstSync=true
            vi.mocked(syncBatch)
                .mockResolvedValueOnce({
                    eof: true,
                    blockStart: 5000,
                    blockEnd: 3000,
                    firstSync: false,
                })
                .mockResolvedValueOnce({
                    // DeleteCmd call for existing language
                    eof: true,
                    blockStart: 5000,
                    blockEnd: 3000,
                    firstSync: false,
                })
                .mockResolvedValueOnce({
                    eof: true,
                    blockStart: 5000,
                    blockEnd: 3000,
                    firstSync: true,
                });

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en", "fr"],
                limit: 100,
                includeDeleteCmds: true,
            });

            // Should be called 3 times: once for existing language ["en"], once for DeleteCmd (firstSync=false), once for new language ["fr"] (firstSync=true, no DeleteCmd call)
            expect(syncBatch).toHaveBeenCalledTimes(3);
            const calls = vi.mocked(syncBatch).mock.calls;
            // First call: existing languages ["en"]
            expect(calls[0][0]).toMatchObject({
                languages: ["en"],
            });
            // Second call: DeleteCmd for existing languages (only for firstSync=false)
            expect(calls[1][0]).toMatchObject({
                type: DocType.DeleteCmd,
                subType: DocType.Post,
            });
            // Third call: new languages ["fr"] (firstSync=true, so no DeleteCmd syncBatch call)
            expect(calls[2][0]).toMatchObject({
                languages: ["fr"],
            });
        });
        it("should start new runner for new memberOf groups", async () => {
            // First call: getGroups returns ["group1"], second call onwards: return all groups to stop recursion
            let callCount = 0;
            vi.mocked(utils.getGroups).mockImplementation(() => {
                callCount++;
                return callCount === 1 ? ["group1"] : ["group1", "group2"];
            });
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);

            // Mock return values: existing group returns firstSync=false, DeleteCmd call, new group returns firstSync=true
            vi.mocked(syncBatch)
                .mockResolvedValueOnce({
                    eof: true,
                    blockStart: 5000,
                    blockEnd: 3000,
                    firstSync: false,
                })
                .mockResolvedValueOnce({
                    // DeleteCmd call for existing group
                    eof: true,
                    blockStart: 5000,
                    blockEnd: 3000,
                    firstSync: false,
                })
                .mockResolvedValueOnce({
                    eof: true,
                    blockStart: 5000,
                    blockEnd: 3000,
                    firstSync: true,
                });

            await sync({
                type: DocType.Post,
                memberOf: ["group1", "group2"],
                limit: 100,
                includeDeleteCmds: true,
            });

            // Should be called 3 times: once for existing groups, once for DeleteCmd (firstSync=false), once for new groups (firstSync=true, no DeleteCmd)
            expect(syncBatch).toHaveBeenCalledTimes(3);
            const calls = vi.mocked(syncBatch).mock.calls;
            expect(calls[0][0]).toMatchObject({
                memberOf: ["group1"],
            });
            // Second call: DeleteCmd for existing groups (only for firstSync=false)
            expect(calls[1][0]).toMatchObject({
                type: DocType.DeleteCmd,
                subType: DocType.Post,
            });
            // Third call: new groups (firstSync=true, so no DeleteCmd syncBatch call)
            expect(calls[2][0]).toMatchObject({
                memberOf: ["group2"],
            });
        });

        it("should handle multiple group sets", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1", "group2", "group3"]);
            // First call: return multiple group sets, subsequent calls: return single group set to stop recursion
            let callCount = 0;
            vi.mocked(utils.getGroupSets).mockImplementation(() => {
                callCount++;
                return callCount === 1
                    ? [["group1"], ["group2", "group3"]]
                    : [["group1", "group2", "group3"]];
            });

            // Mock return values: both return firstSync=false so DeleteCmd is called
            vi.mocked(syncBatch).mockResolvedValue({
                eof: true,
                blockStart: 5000,
                blockEnd: 3000,
                firstSync: false,
            });

            await sync({
                type: DocType.Post,
                memberOf: ["group1", "group2", "group3"],
                limit: 100,
                includeDeleteCmds: true,
            });

            // Should be called 4 times: 2 group sets + 2 DeleteCmd syncs
            expect(syncBatch).toHaveBeenCalledTimes(4);
            const calls = vi.mocked(syncBatch).mock.calls;
            expect(calls[0][0]).toMatchObject({
                memberOf: ["group1"],
            });
            expect(calls[1][0]).toMatchObject({
                type: DocType.DeleteCmd,
                subType: DocType.Post,
            });
            expect(calls[2][0]).toMatchObject({
                memberOf: ["group2", "group3"],
            });
            expect(calls[3][0]).toMatchObject({
                type: DocType.DeleteCmd,
                subType: DocType.Post,
            });
        });

        it("should return early if no new groups and multiple existing group sets", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1", "group2"]);
            // First call: return multiple group sets, subsequent calls: return single group set to stop recursion
            let callCount = 0;
            vi.mocked(utils.getGroupSets).mockImplementation(() => {
                callCount++;
                return callCount === 1 ? [["group1"], ["group2"]] : [["group1", "group2"]];
            });

            // Mock return value: firstSync=false so DeleteCmd is called
            vi.mocked(syncBatch).mockResolvedValue({
                eof: true,
                blockStart: 5000,
                blockEnd: 3000,
                firstSync: false,
            });

            await sync({
                type: DocType.Post,
                memberOf: ["group1", "group2"],
                limit: 100,
                includeDeleteCmds: true,
            });

            // Should be called 4 times: 2 group sets + 2 DeleteCmd syncs (no new groups)
            expect(syncBatch).toHaveBeenCalledTimes(4);
        });

        it("should handle combined new languages and new groups for content documents", async () => {
            // Set up mocks to handle both new languages and new groups without infinite recursion
            let groupCallCount = 0;
            vi.mocked(utils.getGroups).mockImplementation(() => {
                groupCallCount++;
                return groupCallCount === 1 ? ["group1"] : ["group1", "group2"];
            });
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            let langCallCount = 0;
            vi.mocked(utils.getLanguages).mockImplementation(() => {
                langCallCount++;
                return langCallCount === 1 ? ["en"] : ["en", "fr"];
            });

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1", "group2"],
                languages: ["en", "fr"],
                limit: 100,
                includeDeleteCmds: false,
            });

            // Should handle both new languages and new groups
            expect(syncBatch).toHaveBeenCalled();
            expect(vi.mocked(syncBatch).mock.calls.length).toBeGreaterThan(0);
        });

        it("should pass cms flag to syncBatch", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);

            await sync({
                type: DocType.Post,
                memberOf: ["group1"],
                limit: 100,
                cms: true,
                includeDeleteCmds: false,
            });

            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    cms: true,
                    includeDeleteCmds: false,
                }),
            );
        });

        it("should handle empty memberOf array", async () => {
            vi.mocked(utils.getGroups).mockReturnValue([]);
            vi.mocked(utils.getGroupSets).mockReturnValue([]);

            await sync({
                type: DocType.Post,
                memberOf: [],
                limit: 100,
                includeDeleteCmds: false,
            });

            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    memberOf: [],
                    includeDeleteCmds: false,
                }),
            );
        });

        it("should not include languages parameter for non-content types", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);

            await sync({
                type: DocType.Post,
                memberOf: ["group1"],
                limit: 100,
                includeDeleteCmds: false,
            });

            // For non-content types, languages parameter is not passed in options
            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: DocType.Post,
                    memberOf: ["group1"],
                    includeDeleteCmds: false,
                }),
            );
        });

        it("should only process languages for content documents when includeDeleteCmds is true", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(utils.getLanguages).mockReturnValue(["en", "fr"]);
            vi.mocked(utils.getLanguageSets).mockReturnValue([["en", "fr"]]);

            // Mock return value: firstSync=false so DeleteCmd is called
            vi.mocked(syncBatch).mockResolvedValue({
                eof: true,
                blockStart: 5000,
                blockEnd: 3000,
                firstSync: false,
            });

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: true,
            });

            // Should call syncBatch twice: once for languages and once for DeleteCmd (since includeDeleteCmds is true and firstSync=false)
            expect(syncBatch).toHaveBeenCalledTimes(2);
            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    languages: ["en"],
                }),
            );
            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: DocType.DeleteCmd,
                    subType: DocType.Post,
                }),
            );
        });

        it("should include DeleteCmd by default for content documents", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(utils.getLanguages).mockReturnValue(["en"]);
            vi.mocked(utils.getLanguageSets).mockReturnValue([["en"]]);

            // Mock return value: firstSync=false so DeleteCmd is called
            vi.mocked(syncBatch).mockResolvedValue({
                eof: true,
                blockStart: 5000,
                blockEnd: 3000,
                firstSync: false,
            });

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                // Not specifying includeDeleteCmds, should default to true
            });

            // Should call syncBatch twice: once for content and once for DeleteCmd
            expect(syncBatch).toHaveBeenCalledTimes(2);
            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: DocType.Content,
                    includeDeleteCmds: true,
                }),
            );
            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: DocType.DeleteCmd,
                    subType: DocType.Post,
                }),
            );
        });

        it("should handle when only new languages exist (no existing languages)", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            // Return empty array for existing languages
            vi.mocked(utils.getLanguages).mockReturnValue([]);
            // Return empty array for language sets (no existing language sets)
            vi.mocked(utils.getLanguageSets).mockReturnValue([]);

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en", "fr"],
                limit: 100,
                includeDeleteCmds: false,
            });

            // Should call syncBatch once - new languages don't trigger DeleteCmd when includeDeleteCmds is false
            expect(syncBatch).toHaveBeenCalledTimes(1);
            const calls = vi.mocked(syncBatch).mock.calls;
            // Should proceed with the original languages ["en", "fr"]
            expect(calls[0][0]).toMatchObject({
                languages: ["en", "fr"],
            });
        });

        it("should respect explicit includeDeleteCmds: false", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);

            await sync({
                type: DocType.Post,
                memberOf: ["group1"],
                limit: 100,
                includeDeleteCmds: false,
            });

            // Should call syncBatch only once - no DeleteCmd when explicitly set to false
            expect(syncBatch).toHaveBeenCalledTimes(1);
            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: DocType.Post,
                    includeDeleteCmds: false,
                }),
            );
            // Verify DeleteCmd was NOT called
            expect(syncBatch).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    type: DocType.DeleteCmd,
                }),
            );
        });

        it("should push DeleteCmd chunk to syncList when no existing deleteCmd entries found", async () => {
            // Setup for new group scenario where no deleteCmd entries exist yet
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            // syncList starts empty, so no deleteCmd entries exist
            syncList.value = [];

            vi.mocked(syncBatch).mockResolvedValueOnce({
                eof: true,
                blockStart: 5000,
                blockEnd: 3000,
                firstSync: true,
            });

            await sync({
                type: DocType.Post,
                memberOf: ["group1"],
                limit: 100,
                includeDeleteCmds: true,
            });

            // Should call syncBatch once for main sync
            // No DeleteCmd syncBatch call because no existing deleteCmd entries were found
            expect(syncBatch).toHaveBeenCalledTimes(1);

            // Verify a DeleteCmd chunk was pushed to syncList for the new sync column
            const deleteCmdChunk = syncList.value.find(
                (chunk) => chunk.chunkType === "deleteCmd:post",
            );
            expect(deleteCmdChunk).toBeDefined();
            expect(deleteCmdChunk?.memberOf).toEqual(["group1"]);
            expect(deleteCmdChunk?.blockStart).toBe(5000);
            expect(deleteCmdChunk?.blockEnd).toBe(3000);
            expect(deleteCmdChunk?.eof).toBe(true);
        });

        it("should call merge after pushing DeleteCmd chunk for new sync column", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            syncList.value = [];

            vi.mocked(syncBatch).mockResolvedValueOnce({
                eof: true,
                blockStart: 5000,
                blockEnd: 3000,
                firstSync: true,
            });

            await sync({
                type: DocType.Post,
                memberOf: ["group1"],
                limit: 100,
                includeDeleteCmds: true,
            });

            // Verify merge was called with correct parameters after pushing DeleteCmd chunk.
            // The DeleteCmd path always uses open publishDate bounds so deletes propagate
            // regardless of the user's content cutoff.
            expect(merge).toHaveBeenCalledWith({
                type: DocType.DeleteCmd,
                subType: DocType.Post,
                memberOf: ["group1"],
                limit: 100,
                includeDeleteCmds: true,
                publishDateMin: OPEN_MIN,
                publishDateMax: OPEN_MAX,
            });
        });

        it("should push DeleteCmd chunk to syncList for new language when no existing deleteCmd entries", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(utils.getLanguages).mockReturnValue([]);
            vi.mocked(utils.getLanguageSets).mockReturnValue([]);
            // syncList starts empty, so no deleteCmd entries exist
            syncList.value = [];

            vi.mocked(syncBatch).mockResolvedValueOnce({
                eof: false,
                blockStart: 6000,
                blockEnd: 4000,
                firstSync: true,
            });

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: true,
            });

            // Verify a DeleteCmd chunk was pushed to syncList for the content column. It is
            // language-UNSCOPED (`languages: undefined`) so it covers deletes in every language.
            const deleteCmdChunk = syncList.value.find(
                (chunk) => chunk.chunkType === "deleteCmd:post",
            );
            expect(deleteCmdChunk).toBeDefined();
            expect(deleteCmdChunk?.languages).toBeUndefined();
            expect(deleteCmdChunk?.blockStart).toBe(6000);
            expect(deleteCmdChunk?.blockEnd).toBe(4000);
            expect(deleteCmdChunk?.eof).toBe(false);
        });

        it("should call merge with languages for content type after pushing DeleteCmd chunk", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(utils.getLanguages).mockReturnValue([]);
            vi.mocked(utils.getLanguageSets).mockReturnValue([]);
            syncList.value = [];

            vi.mocked(syncBatch).mockResolvedValueOnce({
                eof: false,
                blockStart: 6000,
                blockEnd: 4000,
                firstSync: true,
            });

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: true,
            });

            // Verify merge was called for the DeleteCmd sibling with open publishDate bounds and a
            // language-UNSCOPED set (deletes of any downloaded doc, incl. fallbacks, must propagate).
            expect(merge).toHaveBeenCalledWith({
                type: DocType.DeleteCmd,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: undefined,
                limit: 100,
                includeDeleteCmds: true,
                publishDateMin: OPEN_MIN,
                publishDateMax: OPEN_MAX,
            });
        });

        it("should not push DeleteCmd chunk when syncResult is undefined", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            // syncBatch returns undefined (e.g., cancelled sync)
            vi.mocked(syncBatch).mockResolvedValue(undefined);

            await sync({
                type: DocType.Post,
                memberOf: ["group1", "group2"], // group2 is new
                limit: 100,
                includeDeleteCmds: true,
            });

            // Should not push any DeleteCmd chunk when syncResult is undefined
            const deleteCmdChunks = syncList.value.filter((chunk) =>
                chunk.chunkType.startsWith("deleteCmd:"),
            );
            expect(deleteCmdChunks.length).toBe(0);
        });

        it("should use correct subType for DeleteCmd chunks based on document type", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(utils.getLanguages).mockReturnValue([]);
            vi.mocked(utils.getLanguageSets).mockReturnValue([]);
            syncList.value = [];

            vi.mocked(syncBatch).mockResolvedValueOnce({
                eof: true,
                blockStart: 5000,
                blockEnd: 3000,
                firstSync: true,
            });

            // Test with Content type - should use subType
            await sync({
                type: DocType.Content,
                subType: DocType.Tag,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: true,
            });

            const contentDeleteCmdChunk = syncList.value.find(
                (chunk) => chunk.chunkType === "deleteCmd:tag",
            );
            expect(contentDeleteCmdChunk).toBeDefined();

            syncList.value = [];
            vi.clearAllMocks();

            // Test with non-Content type - should use type as subType
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(syncBatch).mockResolvedValueOnce({
                eof: true,
                blockStart: 5000,
                blockEnd: 3000,
                firstSync: true,
            });

            await sync({
                type: DocType.Post,
                memberOf: ["group1"],
                limit: 100,
                includeDeleteCmds: true,
            });

            const postDeleteCmdChunk = syncList.value.find(
                (chunk) => chunk.chunkType === "deleteCmd:post",
            );
            expect(postDeleteCmdChunk).toBeDefined();
        });

        it("should not push DeleteCmd chunk when existing deleteCmd entries are found", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);

            // Pre-populate syncList with existing deleteCmd entry
            syncList.value = [
                {
                    chunkType: "deleteCmd:post",
                    memberOf: ["group1"],
                    blockStart: 4000,
                    blockEnd: 2000,
                    eof: false,
                },
            ];

            vi.mocked(syncBatch).mockResolvedValue({
                eof: true,
                blockStart: 5000,
                blockEnd: 3000,
                firstSync: false,
            });

            await sync({
                type: DocType.Post,
                memberOf: ["group1"],
                limit: 100,
                includeDeleteCmds: true,
            });

            // Should call syncBatch twice: once for main sync, once for DeleteCmd
            expect(syncBatch).toHaveBeenCalledTimes(2);

            // Should still only have 1 deleteCmd chunk (the original one, not a new one)
            const deleteCmdChunks = syncList.value.filter(
                (chunk) => chunk.chunkType === "deleteCmd:post",
            );
            expect(deleteCmdChunks).toHaveLength(1);
            expect(deleteCmdChunks[0].blockStart).toBe(4000); // Original value unchanged
        });

        it("should call syncBatch for DeleteCmd when not a new sync column", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1", "group2"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1", "group2"]]);
            vi.mocked(syncBatch).mockResolvedValue({
                eof: true,
                blockStart: 5000,
                blockEnd: 3000,
                firstSync: false,
            });

            await sync({
                type: DocType.Post,
                memberOf: ["group1", "group2"], // No new groups
                limit: 100,
                includeDeleteCmds: true,
            });

            // Should call syncBatch twice: once for main sync, once for DeleteCmd
            expect(syncBatch).toHaveBeenCalledTimes(2);
            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: DocType.Post,
                    includeDeleteCmds: true,
                }),
            );
            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: DocType.DeleteCmd,
                    subType: DocType.Post,
                }),
            );
        });

        it("keeps a single language-unscoped deleteCmd column when adding a new content language", async () => {
            // Pre-populate syncList: an existing UNSCOPED deleteCmd:post entry (the post-migration
            // shape — DeleteCmd columns are language-unscoped so a delete of any downloaded doc,
            // including a non-synced fallback translation, propagates).
            syncList.value = [
                {
                    chunkType: "deleteCmd:post",
                    memberOf: ["group1"],
                    languages: undefined,
                    blockStart: 5000,
                    blockEnd: 3000,
                    eof: true,
                },
            ];

            // Mock language utilities: first call sees "en" as existing, subsequent calls see both
            let langCallCount = 0;
            vi.mocked(utils.getLanguages).mockImplementation(() => {
                langCallCount++;
                return langCallCount === 1 ? ["en"] : ["en", "fr"];
            });
            let langSetCallCount = 0;
            vi.mocked(utils.getLanguageSets).mockImplementation(() => {
                langSetCallCount++;
                return langSetCallCount === 1 ? [["en"]] : [["en", "fr"]];
            });

            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);

            // Mock syncBatch:
            // 1st call: existing language ["en"] content sync → firstSync: false
            // 2nd call: DeleteCmd sync for ["en"] → firstSync: false
            // 3rd call: new language ["fr"] content sync → firstSync: true
            vi.mocked(syncBatch)
                .mockResolvedValueOnce({
                    eof: true,
                    blockStart: 5000,
                    blockEnd: 3000,
                    firstSync: false,
                })
                .mockResolvedValueOnce({
                    eof: true,
                    blockStart: 5000,
                    blockEnd: 3000,
                    firstSync: false,
                })
                .mockResolvedValueOnce({
                    eof: true,
                    blockStart: 5000,
                    blockEnd: 3000,
                    firstSync: true,
                });

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en", "fr"],
                limit: 100,
                includeDeleteCmds: true,
            });

            // Adding a new content language must NOT create a second DeleteCmd column: the single
            // unscoped column (matched by filterByTypeMemberOf with languages:undefined) already
            // covers every language, so `hasDeleteCmdEntries` is true and no new column is pushed.
            const deleteCmdCols = syncList.value.filter(
                (chunk) => chunk.chunkType === "deleteCmd:post",
            );
            expect(deleteCmdCols).toHaveLength(1);
            expect(deleteCmdCols[0].languages).toBeUndefined();
        });

        it("should call db.deleteExpired after a Content update sync (non-CMS, firstSync=false)", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(utils.getLanguages).mockReturnValue(["en"]);
            vi.mocked(utils.getLanguageSets).mockReturnValue([["en"]]);
            vi.mocked(syncBatch).mockResolvedValue({
                eof: true,
                blockStart: 5000,
                blockEnd: 3000,
                firstSync: false,
            });

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: false,
            });

            expect(db.deleteExpired).toHaveBeenCalledOnce();
            expect(evictStaleBelowCutoff).toHaveBeenCalledOnce();
        });

        it("should not call db.deleteExpired for a Content full initial sync (firstSync=true)", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(utils.getLanguages).mockReturnValue(["en"]);
            vi.mocked(utils.getLanguageSets).mockReturnValue([["en"]]);
            vi.mocked(syncBatch).mockResolvedValue({
                eof: true,
                blockStart: 5000,
                blockEnd: 0,
                firstSync: true,
            });

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: false,
            });

            expect(db.deleteExpired).not.toHaveBeenCalled();
            expect(evictStaleBelowCutoff).not.toHaveBeenCalled();
        });

        it("should not call db.deleteExpired for a non-Content update sync", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(syncBatch).mockResolvedValue({
                eof: true,
                blockStart: 5000,
                blockEnd: 3000,
                firstSync: false,
            });

            await sync({
                type: DocType.Post,
                memberOf: ["group1"],
                limit: 100,
                includeDeleteCmds: false,
            });

            expect(db.deleteExpired).not.toHaveBeenCalled();
            expect(evictStaleBelowCutoff).not.toHaveBeenCalled();
        });

        it("should not call db.deleteExpired for a CMS Content update sync", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(utils.getLanguages).mockReturnValue(["en"]);
            vi.mocked(utils.getLanguageSets).mockReturnValue([["en"]]);
            vi.mocked(syncBatch).mockResolvedValue({
                eof: true,
                blockStart: 5000,
                blockEnd: 3000,
                firstSync: false,
            });

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                cms: true,
                includeDeleteCmds: false,
            });

            expect(db.deleteExpired).not.toHaveBeenCalled();
            expect(evictStaleBelowCutoff).not.toHaveBeenCalled();
        });

        it("should not call db.deleteExpired when syncResult is undefined (cancelled sync)", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(utils.getLanguages).mockReturnValue(["en"]);
            vi.mocked(utils.getLanguageSets).mockReturnValue([["en"]]);
            vi.mocked(syncBatch).mockResolvedValue(undefined);

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: false,
            });

            expect(db.deleteExpired).not.toHaveBeenCalled();
            expect(evictStaleBelowCutoff).not.toHaveBeenCalled();
        });

        it("resets degenerate chunkTypes at the top of sync() so runtime drift self-heals", async () => {
            // Companion to initSync's startup-time degeneracy reset. If runtime drift
            // (e.g. a socket push, a concurrent runner, a partial write) leaves two same-key
            // columns in syncList between sync() calls, the next sync() must filter them
            // (plus their paired deleteCmd sibling) before trim/merge/_sync runs — otherwise
            // the dual-column shape persists across the whole iteration.
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(utils.getLanguages).mockReturnValue(["en"]);
            vi.mocked(utils.getLanguageSets).mockReturnValue([["en"]]);

            // Inject two same-key (chunkType + memberOf + languages) entries — the exact
            // shape findDegenerateChunkTypes flags.
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 0,
                    eof: true,
                    publishDateMin: OPEN_MIN,
                    publishDateMax: OPEN_MAX,
                },
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 12000,
                    blockEnd: 11000,
                    eof: true,
                    publishDateMin: OPEN_MIN,
                    publishDateMax: OPEN_MAX,
                },
                // unrelated chunkType — must survive the reset
                {
                    chunkType: "group",
                    memberOf: ["group1"],
                    languages: undefined,
                    blockStart: 9999,
                    blockEnd: 0,
                    eof: true,
                    publishDateMin: OPEN_MIN,
                    publishDateMax: OPEN_MAX,
                },
            ];

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: false,
            });

            // The two degenerate content:post entries must be gone (sync's reset filtered them).
            // The unrelated chunkType stays.
            const contentEntries = syncList.value.filter((e) => e.chunkType === "content:post");
            const groupEntries = syncList.value.filter((e) => e.chunkType === "group");
            expect(contentEntries).toHaveLength(0);
            expect(groupEntries).toHaveLength(1);
        });

        it("does NOT flag entries that differ only by publishDate range as degenerate", async () => {
            // Two entries with identical memberOf+languages but DIFFERENT publishDate ranges
            // describe a legitimate publishDate-split column (e.g. one column for the configured
            // cutoff window, another for the older catch-up window). They must survive sync()
            // — false-flagging them would discard both columns' progress.
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(utils.getLanguages).mockReturnValue(["en"]);
            vi.mocked(utils.getLanguageSets).mockReturnValue([["en"]]);

            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 0,
                    eof: true,
                    publishDateMin: OPEN_MIN,
                    publishDateMax: 999,
                },
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 12000,
                    blockEnd: 0,
                    eof: true,
                    publishDateMin: 1000,
                    publishDateMax: OPEN_MAX,
                },
            ];

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: false,
            });

            // Both publishDate-split entries must still be present.
            const contentEntries = syncList.value.filter((e) => e.chunkType === "content:post");
            expect(contentEntries).toHaveLength(2);
            expect(contentEntries.find((e) => e.publishDateMax === 999)).toBeDefined();
            expect(contentEntries.find((e) => e.publishDateMin === 1000)).toBeDefined();
        });
    });

    describe("stale subset cleanup (covers the seeded mid-sync-vs-eof-superset bug)", () => {
        // The bug it addresses: an injected / drifted syncList can contain a mid-sync entry
        // (eof:false) whose memberOf is a strict subset of another eof:true entry's memberOf
        // for the same chunkType + languages + publishDate. Such a pair is invisible to every
        // existing self-heal:
        //   - findDegenerateChunkTypes requires identical memberOf (mismatch — different sizes)
        //   - mergeVertical filters by exact memberOf equality (skips the pair)
        //   - mergeHorizontal requires BOTH columns to be eof:true (subset is eof:false)
        // So the subset persists forever, and _sync's group-split treats it as a real second
        // column, recursing for it on every sync iteration. removeStaleSubsetEntries drops it
        // before _sync sees it, so the canonical column is the only one syncing.
        beforeEach(async () => {
            await initSync(mockHttpService);
            vi.mocked(syncBatch).mockResolvedValue({
                eof: true,
                blockStart: 5000,
                blockEnd: 0,
                firstSync: false,
            });
        });

        it("drops a mid-sync subset whose eof:true superset (same key) already covers it", async () => {
            // The exact shape of the user-reported seed: a memberOf=[g1..gN] eof:true entry plus
            // a memberOf=[g1,g2] eof:false entry at the same languages + publishDate window.
            vi.mocked(utils.getGroups).mockReturnValue(["g1", "g2", "g3"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["g1", "g2", "g3"]]);
            vi.mocked(utils.getLanguages).mockReturnValue(["en"]);
            vi.mocked(utils.getLanguageSets).mockReturnValue([["en"]]);

            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["g1", "g2", "g3"],
                    languages: ["en"],
                    blockStart: 9000,
                    blockEnd: 0,
                    eof: true,
                    publishDateMin: OPEN_MIN,
                    publishDateMax: OPEN_MAX,
                },
                {
                    chunkType: "content:post",
                    memberOf: ["g1", "g2"],
                    languages: ["en"],
                    blockStart: 8000,
                    blockEnd: 5000,
                    eof: false,
                    publishDateMin: OPEN_MIN,
                    publishDateMax: OPEN_MAX,
                },
            ];

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["g1", "g2", "g3"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: false,
            });

            const contentEntries = syncList.value.filter((e) => e.chunkType === "content:post");
            expect(contentEntries).toHaveLength(1);
            expect(contentEntries[0].memberOf).toEqual(["g1", "g2", "g3"]);
            expect(contentEntries[0].eof).toBe(true);
        });

        it("does NOT drop a mid-sync entry when no eof:true superset exists for the same key", async () => {
            // Sibling entries at the same key but neither is eof:true — both must be preserved
            // (they may be legitimately catching up different ranges).
            vi.mocked(utils.getGroups).mockReturnValue(["g1", "g2"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["g1", "g2"]]);
            vi.mocked(utils.getLanguages).mockReturnValue(["en"]);
            vi.mocked(utils.getLanguageSets).mockReturnValue([["en"]]);

            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["g1", "g2"],
                    languages: ["en"],
                    blockStart: 9000,
                    blockEnd: 6000,
                    eof: false,
                    publishDateMin: OPEN_MIN,
                    publishDateMax: OPEN_MAX,
                },
                {
                    chunkType: "content:post",
                    memberOf: ["g1"],
                    languages: ["en"],
                    blockStart: 8000,
                    blockEnd: 5000,
                    eof: false,
                    publishDateMin: OPEN_MIN,
                    publishDateMax: OPEN_MAX,
                },
            ];

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["g1", "g2"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: false,
            });

            const contentEntries = syncList.value.filter((e) => e.chunkType === "content:post");
            expect(contentEntries).toHaveLength(2);
        });

        it("does NOT drop a subset whose superset belongs to a different publishDate window", async () => {
            // The superset's eof:true coverage doesn't extend into the subset's window when
            // their publishDate ranges differ — the subset's data is NOT redundant.
            vi.mocked(utils.getGroups).mockReturnValue(["g1", "g2"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["g1", "g2"]]);
            vi.mocked(utils.getLanguages).mockReturnValue(["en"]);
            vi.mocked(utils.getLanguageSets).mockReturnValue([["en"]]);

            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["g1", "g2"],
                    languages: ["en"],
                    blockStart: 9000,
                    blockEnd: 0,
                    eof: true,
                    publishDateMin: 1000,
                    publishDateMax: OPEN_MAX,
                },
                {
                    chunkType: "content:post",
                    memberOf: ["g1"],
                    languages: ["en"],
                    blockStart: 8000,
                    blockEnd: 5000,
                    eof: false,
                    publishDateMin: OPEN_MIN,
                    publishDateMax: 999,
                },
            ];

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["g1", "g2"],
                languages: ["en"],
                publishDateMin: OPEN_MIN,
                publishDateMax: OPEN_MAX,
                limit: 100,
                includeDeleteCmds: false,
            });

            const contentEntries = syncList.value.filter((e) => e.chunkType === "content:post");
            expect(contentEntries).toHaveLength(2);
        });
    });

    describe("publishDate column spawning (Part A)", () => {
        beforeEach(async () => {
            await initSync(mockHttpService);
            vi.mocked(syncBatch).mockResolvedValue({
                eof: true,
                blockStart: 5000,
                blockEnd: 3000,
                firstSync: false,
            });
        });

        it("does NOT spawn extra runners when called with default (open) publishDate bounds and empty syncList", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(utils.getLanguages).mockReturnValue(["en"]);
            vi.mocked(utils.getLanguageSets).mockReturnValue([["en"]]);
            syncList.value = [];

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: false,
            });

            // Exactly one content syncBatch call — the publishDate block resolved to
            // the open uncovered slice (no-op) and continued with this runner.
            expect(syncBatch).toHaveBeenCalledTimes(1);
            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: DocType.Content,
                    publishDateMin: OPEN_MIN,
                    publishDateMax: OPEN_MAX,
                }),
            );
        });

        it("does NOT spawn when requested range is a strict subset of one existing range", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(utils.getLanguages).mockReturnValue(["en"]);
            vi.mocked(utils.getLanguageSets).mockReturnValue([["en"]]);
            // Existing column covers [100..5000].
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 0,
                    eof: true,
                    publishDateMin: 100,
                    publishDateMax: 5000,
                },
            ];

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: false,
                publishDateMin: 200,
                publishDateMax: 1000, // strictly inside the existing range
            });

            // Only one Content syncBatch call. The spawn block sees a single inside
            // range with no uncovered slice and skips, letting this runner continue
            // with the originally-requested bounds.
            const contentCalls = vi
                .mocked(syncBatch)
                .mock.calls.filter((c) => (c[0] as any).type === DocType.Content);
            expect(contentCalls).toHaveLength(1);
            expect(contentCalls[0][0]).toMatchObject({
                publishDateMin: 200,
                publishDateMax: 1000,
            });
        });

        it("spawns a new column when the user broadens the cutoff (uncovered older window)", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(utils.getLanguages).mockReturnValue(["en"]);
            vi.mocked(utils.getLanguageSets).mockReturnValue([["en"]]);
            // Existing column covers the recent window [1000..OPEN_MAX].
            syncList.value = [
                {
                    chunkType: "content:post",
                    memberOf: ["group1"],
                    languages: ["en"],
                    blockStart: 5000,
                    blockEnd: 0,
                    eof: true,
                    publishDateMin: 1000,
                    publishDateMax: OPEN_MAX,
                },
            ];

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: false,
                publishDateMin: 500, // broadened — older window now requested
                publishDateMax: OPEN_MAX,
            });

            const contentCalls = vi
                .mocked(syncBatch)
                .mock.calls.filter((c) => (c[0] as any).type === DocType.Content);

            // Two columns: one resumed for the existing range, one for the uncovered slice.
            expect(contentCalls).toHaveLength(2);

            const resumed = contentCalls.find((c) => (c[0] as any).publishDateMin === 1000);
            const spawned = contentCalls.find((c) => (c[0] as any).publishDateMin === 500);
            expect(resumed).toBeDefined();
            expect(spawned).toBeDefined();
            // The spawned column covers the uncovered gap [500..999].
            expect((spawned![0] as any).publishDateMax).toBe(999);
        });
    });

    describe("content publishDate cutoff floor (SharedConfig.contentPublishDateCutoff)", () => {
        const CONFIGURED_CUTOFF = 42_000_000;

        beforeEach(async () => {
            await initSync(mockHttpService);
            vi.mocked(syncBatch).mockResolvedValue(undefined);
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(utils.getLanguages).mockReturnValue(["en"]);
            vi.mocked(utils.getLanguageSets).mockReturnValue([["en"]]);
            initConfig({
                cms: false,
                docsIndex: "type",
                apiUrl: "https://api.example.com",
                contentPublishDateCutoff: CONFIGURED_CUTOFF,
            });
        });

        afterEach(() => {
            // Restore the default (no cutoff) so unrelated tests aren't affected.
            initConfig({
                cms: false,
                docsIndex: "type",
                apiUrl: "https://api.example.com",
            });
        });

        it("content sync without an explicit publishDateMin floors to the configured cutoff", async () => {
            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: false,
            });

            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: DocType.Content,
                    publishDateMin: CONFIGURED_CUTOFF,
                    publishDateMax: OPEN_MAX,
                }),
            );
        });

        it("non-content sync ignores the cutoff and leaves publishDate bounds undefined", async () => {
            // publishDate is a Content-only sync dimension. For non-Content callers (Language,
            // Redirect, Storage, AuthProvider, Group, …) we don't even default the bounds, so
            // downstream comparators treat them as the open range via resolveRange.
            await sync({
                type: DocType.Post,
                memberOf: ["group1"],
                limit: 100,
                includeDeleteCmds: false,
            });

            const call = vi.mocked(syncBatch).mock.calls[0][0];
            expect(call.type).toBe(DocType.Post);
            expect(call.publishDateMin).toBeUndefined();
            expect(call.publishDateMax).toBeUndefined();
        });

        it("an explicit publishDateMin from the caller still wins over the configured cutoff", async () => {
            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: false,
                publishDateMin: 12_345,
            });

            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    publishDateMin: 12_345,
                }),
            );
        });

        it("sync() also triggers a companion always-offline run when a cutoff is configured", async () => {
            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: false,
            });

            // Windowed run: floored to the configured cutoff.
            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    publishDateMin: CONFIGURED_CUTOFF,
                    publishDateMax: OPEN_MAX,
                }),
            );
            // Companion always-offline run: open publishDate bounds, regardless of the cutoff.
            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    alwaysOffline: true,
                    publishDateMin: OPEN_MIN,
                    publishDateMax: OPEN_MAX,
                }),
            );
        });

        it("does not trigger a companion run for an explicit alwaysOffline call (avoids recursion)", async () => {
            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: false,
                alwaysOffline: true,
            });

            expect(syncBatch).toHaveBeenCalledTimes(1);
            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({ alwaysOffline: true }),
            );
        });

        it("does not trigger a companion run for non-Content types even with a cutoff configured", async () => {
            await sync({
                type: DocType.Post,
                memberOf: ["group1"],
                limit: 100,
                includeDeleteCmds: false,
            });

            expect(syncBatch).toHaveBeenCalledTimes(1);
        });
    });

    describe("sync without a configured content publishDate cutoff", () => {
        beforeEach(async () => {
            await initSync(mockHttpService);
            vi.mocked(syncBatch).mockResolvedValue(undefined);
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(utils.getLanguages).mockReturnValue(["en"]);
            vi.mocked(utils.getLanguageSets).mockReturnValue([["en"]]);
        });

        it("does not trigger a companion always-offline run when no cutoff is configured", async () => {
            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: false,
            });

            expect(syncBatch).toHaveBeenCalledTimes(1);
            expect(vi.mocked(syncBatch).mock.calls[0][0].alwaysOffline).toBeUndefined();
        });
    });
});
