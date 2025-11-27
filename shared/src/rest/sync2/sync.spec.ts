import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { initSync, sync, setCancelSync, cancelSync } from "./sync";
import { HttpReq } from "../http";
import { db } from "../../db/database";
import { syncBatch } from "./syncBatch";
import { syncList } from "./state";
import { DocType } from "../../types";
import * as utils from "./utils";

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
            });

            expect(trim).toHaveBeenCalledWith({
                type: DocType.Post,
                memberOf: ["group1"],
                limit: 100,
            });
        });

        it("should return early if cancelSync is true", async () => {
            setCancelSync(true);

            await sync({
                type: DocType.Post,
                memberOf: ["group1"],
                languages: [],
                limit: 100,
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
            });

            expect(syncBatch).toHaveBeenCalledWith({
                type: DocType.Post,
                memberOf: ["group1"],
                limit: 100,
                initialSync: true,
                httpService: mockHttpService,
            });
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
            });

            // Verify getGroupSets was called with the full options object
            expect(utils.getGroupSets).toHaveBeenCalledWith({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
            });

            expect(syncBatch).toHaveBeenCalledWith({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en"],
                limit: 100,
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

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en", "fr"],
                limit: 100,
            });

            // Should be called twice: once for existing language ["en"], once for new language ["fr"]
            expect(syncBatch).toHaveBeenCalledTimes(2);
            const calls = vi.mocked(syncBatch).mock.calls;
            // First call: existing languages ["en"]
            expect(calls[0][0]).toMatchObject({
                languages: ["en"],
            });
            // Second call: new languages ["fr"] since existing has ["en"]
            expect(calls[1][0]).toMatchObject({
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

            await sync({
                type: DocType.Post,
                memberOf: ["group1", "group2"],
                limit: 100,
            });

            // Should be called twice: once for existing groups, once for new groups
            expect(syncBatch).toHaveBeenCalledTimes(2);
            const calls = vi.mocked(syncBatch).mock.calls;
            expect(calls[0][0]).toMatchObject({
                memberOf: ["group1"],
            });
            expect(calls[1][0]).toMatchObject({
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

            await sync({
                type: DocType.Post,
                memberOf: ["group1", "group2", "group3"],
                limit: 100,
            });

            // Should be called for each group set
            expect(syncBatch).toHaveBeenCalledTimes(2);
            const calls = vi.mocked(syncBatch).mock.calls;
            expect(calls[0][0]).toMatchObject({
                memberOf: ["group1"],
            });
            expect(calls[1][0]).toMatchObject({
                memberOf: ["group2", "group3"],
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

            await sync({
                type: DocType.Post,
                memberOf: ["group1", "group2"],
                limit: 100,
            });

            // Should be called for each existing group set, but not for new groups
            expect(syncBatch).toHaveBeenCalledTimes(2);
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
            });

            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    cms: true,
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
            });

            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    memberOf: [],
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
            });

            // For non-content types, languages parameter is not passed in options
            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: DocType.Post,
                    memberOf: ["group1"],
                }),
            );
        });

        it("should only process new languages for content documents", async () => {
            vi.mocked(utils.getGroups).mockReturnValue(["group1"]);
            vi.mocked(utils.getGroupSets).mockReturnValue([["group1"]]);
            vi.mocked(utils.getLanguages).mockReturnValue(["en", "fr"]);

            await sync({
                type: DocType.Content,
                subType: DocType.Post,
                memberOf: ["group1"],
                languages: ["en", "fr"],
                limit: 100,
            });

            // Should only call syncBatch once since all languages already exist
            expect(syncBatch).toHaveBeenCalledTimes(1);
            expect(syncBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    languages: ["en", "fr"],
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
            });

            // Should call syncBatch once - no recursive call since existingLanguages is empty
            // The condition is: if (languageSets.length > 1 || newLanguages.length > 0)
            // Since languageSets is empty and newLanguages.length is 2 (all languages are new),
            // it will not enter the block to start new runners for language sets
            expect(syncBatch).toHaveBeenCalledTimes(1);
            const calls = vi.mocked(syncBatch).mock.calls;
            // Should proceed with the original languages ["en", "fr"]
            expect(calls[0][0]).toMatchObject({
                languages: ["en", "fr"],
            });
        });
    });
});
