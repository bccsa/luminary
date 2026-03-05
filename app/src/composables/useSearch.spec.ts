import { describe, it, expect, beforeEach, vi } from "vitest";
import { ref } from "vue";

const mockInitializeSearchIndex = vi.fn().mockResolvedValue(undefined);
const mockSearch = vi.fn().mockReturnValue([]);
const mockRebuildSearchIndex = vi.fn().mockResolvedValue(undefined);
const mockRegisterSearchIndexSync = vi.fn();
const searchIndexSizeRef = ref(0);

vi.mock("../search", () => ({
    initializeSearchIndex: (...args: unknown[]) => mockInitializeSearchIndex(...args),
    search: (...args: unknown[]) => mockSearch(...args),
    addToSearchIndex: vi.fn(),
    addAllToSearchIndex: vi.fn(),
    removeFromSearchIndex: vi.fn(),
    removeAllFromSearchIndex: vi.fn(),
    updateSearchIndex: vi.fn(),
    rebuildSearchIndex: (...args: unknown[]) => mockRebuildSearchIndex(...args),
    registerSearchIndexSync: (...args: unknown[]) => mockRegisterSearchIndexSync(...args),
    searchIndexSizeRef,
    getSearchIndexSize: vi.fn(() => searchIndexSizeRef.value),
}));

vi.mock("@/globalConfig", () => ({
    appLanguageIdsAsRef: ref([]),
}));

vi.mock("luminary-shared", async () => {
    const actual = await vi.importActual<typeof import("luminary-shared")>("luminary-shared");
    return {
        ...actual,
        isConnected: ref(false),
    };
});

describe("useSearch.ts", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        searchIndexSizeRef.value = 0;
        await vi.resetModules();
    });

    it("exposes isInitialized false until initialize() completes", async () => {
        const { useSearch } = await import("./useSearch");
        const { isInitialized, initialize } = useSearch();

        expect(isInitialized.value).toBe(false);
        await initialize();
        expect(isInitialized.value).toBe(true);
        expect(mockInitializeSearchIndex).toHaveBeenCalledTimes(1);
    });

    it("performSearch returns empty when not initialized", async () => {
        const { useSearch } = await import("./useSearch");
        const { performSearch, isInitialized } = useSearch();

        expect(isInitialized.value).toBe(false);
        const results = performSearch("test");
        expect(results).toEqual([]);
        expect(mockSearch).not.toHaveBeenCalled();
    });

    it("performSearch calls search and updates results when initialized", async () => {
        const { useSearch } = await import("./useSearch");
        const { initialize, performSearch, results } = useSearch();

        await initialize();
        const mockResults = [{ _id: "1", title: "Hit", score: 1 }];
        mockSearch.mockReturnValue(mockResults);

        const out = performSearch("test");
        expect(out).toEqual(mockResults);
        expect(results.value).toEqual(mockResults);
        expect(mockSearch).toHaveBeenCalledWith("test", {});
    });

    it("indexSize reflects searchIndexSizeRef", async () => {
        const { useSearch } = await import("./useSearch");
        const { indexSize } = useSearch();

        expect(indexSize.value).toBe(0);
        searchIndexSizeRef.value = 42;
        expect(indexSize.value).toBe(42);
    });

    it("initializeWithAutoSync calls setupAutoSync, initialize, and registerSearchIndexSync", async () => {
        const { useSearch } = await import("./useSearch");
        const { initializeWithAutoSync } = useSearch();

        await initializeWithAutoSync();

        expect(mockInitializeSearchIndex).toHaveBeenCalled();
        expect(mockRegisterSearchIndexSync).toHaveBeenCalled();
    });

    it("rebuild prevents concurrent rebuilds", async () => {
        const { useSearch } = await import("./useSearch");
        const { initialize, rebuild } = useSearch();

        await initialize();
        let resolveRebuild: () => void;
        const rebuildPromise = new Promise<void>((r) => {
            resolveRebuild = r;
        });
        mockRebuildSearchIndex.mockReturnValue(rebuildPromise);

        const p1 = rebuild();
        const p2 = rebuild();
        resolveRebuild!();
        await p1;
        await p2;

        expect(mockRebuildSearchIndex).toHaveBeenCalledTimes(1);
    });

    it("performSearch passes options through to search", async () => {
        const { useSearch } = await import("./useSearch");
        const { initialize, performSearch } = useSearch();

        await initialize();
        performSearch("query", { languages: ["lang-eng"] });

        expect(mockSearch).toHaveBeenCalledWith("query", { languages: ["lang-eng"] });
    });
});
