import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { initSync, sync, setCancelSync, cancelSync } from "./sync";
import { HttpReq } from "../http";
import { db } from "../../db/database";
import { syncBatch } from "./syncBatch";
import { syncList } from "./state";
import { DocType } from "../../types";
import * as utils from "./utils";
import { merge, mergeHorizontal } from "./merge";

// Mock dependencies
vi.mock("../../db/database", () => ({
    db: {
        getSyncList: vi.fn(),
    },
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
            const mockSyncListData = [
                {
                    chunkType: "post",
                    memberOf: ["group1"],
                    blockStart: 1000,
                    blockEnd: 0,
                },
            ];
            vi.mocked(db.getSyncList).mockResolvedValue(mockSyncListData);

            await initSync(mockHttpService);

            expect(db.getSyncList).toHaveBeenCalled();
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

            // Verify merge was called with correct parameters after pushing DeleteCmd chunk
            expect(merge).toHaveBeenCalledWith({
                type: DocType.DeleteCmd,
                subType: DocType.Post,
                memberOf: ["group1"],
                limit: 100,
                includeDeleteCmds: true,
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

            // Verify a DeleteCmd chunk was pushed to syncList for the new language column
            const deleteCmdChunk = syncList.value.find(
                (chunk) => chunk.chunkType === "deleteCmd:post" && chunk.languages?.includes("en"),
            );
            expect(deleteCmdChunk).toBeDefined();
            expect(deleteCmdChunk?.languages).toEqual(["en"]);
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

            // Verify merge was called with correct parameters including languages
            expect(merge).toHaveBeenCalledWith({
                type: DocType.DeleteCmd,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
                includeDeleteCmds: true,
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

        it("should merge deleteCmd languages when adding a new language via horizontal merge", async () => {
            // Pre-populate syncList: existing deleteCmd:post entry for "en" (already synced)
            syncList.value = [
                {
                    chunkType: "deleteCmd:post",
                    memberOf: ["group1"],
                    languages: ["en"],
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

            // After sync: the new deleteCmd:post entry for ["fr"] was pushed to syncList.
            // merge() was mocked (no-op), so verify both entries exist first.
            const deleteCmdBefore = syncList.value.filter(
                (chunk) => chunk.chunkType === "deleteCmd:post",
            );
            expect(deleteCmdBefore).toHaveLength(2);

            // Now run the real mergeHorizontal (exposed via mock factory's vi.importActual)
            // to verify the fix correctly combines deleteCmd languages.
            mergeHorizontal({ type: DocType.DeleteCmd, subType: DocType.Post });

            const deleteCmdAfter = syncList.value.filter(
                (chunk) => chunk.chunkType === "deleteCmd:post",
            );
            expect(deleteCmdAfter).toHaveLength(1);
            expect(deleteCmdAfter[0].languages).toEqual(["en", "fr"]);
        });
    });
});
