import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, effectScope, nextTick } from "vue";

vi.mock("./ftsSearch", () => ({
    ftsSearch: vi.fn(),
}));

// Keep the real shouldUseApiFts (drives routing from real config + isConnected);
// only stub the network call.
vi.mock("./ftsSearchApi", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./ftsSearchApi")>();
    return { ...actual, ftsSearchApi: vi.fn() };
});

import { useFtsSearch } from "./useFtsSearch";
import { ftsSearch } from "./ftsSearch";
import { ftsSearchApi } from "./ftsSearchApi";
import { isConnected } from "../socket/socketio";
import { initConfig } from "../config";
import type { FtsSearchResult } from "./types";

const mockFtsSearch = vi.mocked(ftsSearch);
const mockFtsSearchApi = vi.mocked(ftsSearchApi);

const CUTOFF = { cms: false, docsIndex: "", apiUrl: "http://x", contentPublishDateCutoff: 12345 };
const NO_CUTOFF = { cms: false, docsIndex: "", apiUrl: "http://x" };

function makeResult(docId: string, score = 1, wordMatchScore = 0): FtsSearchResult {
    return { docId, score, wordMatchScore, doc: { _id: docId } as any };
}

describe("useFtsSearch", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        mockFtsSearch.mockResolvedValue([]);
        mockFtsSearchApi.mockResolvedValue([]);
        isConnected.value = false;
        initConfig({ ...NO_CUTOFF } as any);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("returns reactive refs with initial empty state", () => {
        const scope = effectScope();
        scope.run(() => {
            const queryRef = ref("");
            const result = useFtsSearch(queryRef);
            expect(result.results.value).toEqual([]);
            expect(result.isSearching.value).toBe(false);
            expect(result.hasMore.value).toBe(false);
            expect(result.totalLoaded.value).toBe(0);
            expect(result.lastSearchedQuery.value).toBe("");
        });
        scope.stop();
    });

    it("triggers debounced search after delay", async () => {
        const scope = effectScope();
        scope.run(() => {
            const queryRef = ref("quantum physics");
            mockFtsSearch.mockResolvedValue([makeResult("1")]);
            useFtsSearch(queryRef, { debounceMs: 100 });
        });

        // Search should not have been called yet (debouncing)
        expect(mockFtsSearch).not.toHaveBeenCalled();

        // Advance past debounce
        await vi.advanceTimersByTimeAsync(150);

        expect(mockFtsSearch).toHaveBeenCalledWith(
            expect.objectContaining({ query: "quantum physics" }),
        );
        scope.stop();
    });

    it("clears results for short queries (< 3 chars)", async () => {
        const scope = effectScope();
        let result: any;
        scope.run(() => {
            const queryRef = ref("ab");
            result = useFtsSearch(queryRef, { debounceMs: 50 });
        });

        await vi.advanceTimersByTimeAsync(100);

        expect(result.results.value).toEqual([]);
        expect(mockFtsSearch).not.toHaveBeenCalled();
        scope.stop();
    });

    it("clears results for empty queries", async () => {
        const scope = effectScope();
        let result: any;
        scope.run(() => {
            const queryRef = ref("");
            result = useFtsSearch(queryRef, { debounceMs: 50 });
        });

        await vi.advanceTimersByTimeAsync(100);

        expect(result.results.value).toEqual([]);
        scope.stop();
    });

    it("supports loadMore pagination", async () => {
        const scope = effectScope();
        let result: any;
        scope.run(() => {
            const queryRef = ref("quantum physics test");
            // Return full page so hasMore = true
            const fullPage = Array.from({ length: 20 }, (_, i) => makeResult(`doc-${i}`));
            mockFtsSearch.mockResolvedValue(fullPage);
            result = useFtsSearch(queryRef, { debounceMs: 50, pageSize: 20 });
        });

        await vi.advanceTimersByTimeAsync(100);
        // Wait for the async search to resolve
        await vi.advanceTimersByTimeAsync(10);

        expect(result.hasMore.value).toBe(true);
        expect(result.totalLoaded.value).toBe(20);

        // Load more
        mockFtsSearch.mockResolvedValue([makeResult("doc-20", 0.5)]);
        result.loadMore();
        await vi.advanceTimersByTimeAsync(10);

        expect(result.totalLoaded.value).toBe(21);
        expect(result.hasMore.value).toBe(false);
        scope.stop();
    });

    it("loadMore does nothing while searching", async () => {
        const scope = effectScope();
        let result: any;
        scope.run(() => {
            const queryRef = ref("quantum physics test");
            // Make search hang
            mockFtsSearch.mockReturnValue(new Promise(() => {}));
            result = useFtsSearch(queryRef, { debounceMs: 50 });
        });

        await vi.advanceTimersByTimeAsync(100);

        // isSearching should be true
        expect(result.isSearching.value).toBe(true);
        const callCount = mockFtsSearch.mock.calls.length;
        await result.loadMore();
        expect(mockFtsSearch.mock.calls.length).toBe(callCount);
        scope.stop();
    });

    it("loadMore does nothing when !hasMore", async () => {
        const scope = effectScope();
        let result: any;
        scope.run(() => {
            const queryRef = ref("quantum physics test");
            mockFtsSearch.mockResolvedValue([makeResult("1")]);
            result = useFtsSearch(queryRef, { debounceMs: 50 });
        });

        await vi.advanceTimersByTimeAsync(100);
        await vi.advanceTimersByTimeAsync(10);

        expect(result.hasMore.value).toBe(false);
        const callCount = mockFtsSearch.mock.calls.length;
        await result.loadMore();
        expect(mockFtsSearch.mock.calls.length).toBe(callCount);
        scope.stop();
    });

    it("manual mode does not watch query changes", async () => {
        const scope = effectScope();
        scope.run(() => {
            const queryRef = ref("quantum physics test");
            useFtsSearch(queryRef, { debounceMs: "manual" });
        });

        await vi.advanceTimersByTimeAsync(1000);

        // Should not have been called
        expect(mockFtsSearch).not.toHaveBeenCalled();
        scope.stop();
    });

    it("manual mode works with runSearch()", async () => {
        const scope = effectScope();
        let result: any;
        scope.run(() => {
            const queryRef = ref("quantum physics test");
            mockFtsSearch.mockResolvedValue([makeResult("1")]);
            result = useFtsSearch(queryRef, { debounceMs: "manual" });
        });

        result.runSearch();
        await vi.advanceTimersByTimeAsync(10);

        expect(mockFtsSearch).toHaveBeenCalled();
        scope.stop();
    });

    it("debounceMs: 0 acts as trigger-only mode", async () => {
        const scope = effectScope();
        scope.run(() => {
            const queryRef = ref("quantum physics test");
            useFtsSearch(queryRef, { debounceMs: 0 });
        });

        await vi.advanceTimersByTimeAsync(1000);
        expect(mockFtsSearch).not.toHaveBeenCalled();
        scope.stop();
    });

    it("handles search errors gracefully", async () => {
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const scope = effectScope();
        let result: any;
        scope.run(() => {
            const queryRef = ref("quantum physics test");
            mockFtsSearch.mockRejectedValue(new Error("search failed"));
            result = useFtsSearch(queryRef, { debounceMs: 50 });
        });

        await vi.advanceTimersByTimeAsync(100);
        await vi.advanceTimersByTimeAsync(10);

        expect(consoleSpy).toHaveBeenCalled();
        expect(result.isSearching.value).toBe(false);
        consoleSpy.mockRestore();
        scope.stop();
    });

    it("language change triggers re-search", async () => {
        const scope = effectScope();
        const langRef = ref("lang-eng");
        scope.run(() => {
            const queryRef = ref("quantum physics test");
            mockFtsSearch.mockResolvedValue([makeResult("1")]);
            useFtsSearch(queryRef, { debounceMs: 50, languageId: langRef });
        });

        await vi.advanceTimersByTimeAsync(100);
        await vi.advanceTimersByTimeAsync(10);

        const callCount = mockFtsSearch.mock.calls.length;
        langRef.value = "lang-fra";
        await nextTick();
        await vi.advanceTimersByTimeAsync(10);

        expect(mockFtsSearch.mock.calls.length).toBeGreaterThan(callCount);
        scope.stop();
    });

    it("cleans up on scope dispose", async () => {
        const scope = effectScope();
        scope.run(() => {
            const queryRef = ref("quantum physics test");
            useFtsSearch(queryRef, { debounceMs: 100 });
        });

        // Dispose before debounce fires
        scope.stop();

        await vi.advanceTimersByTimeAsync(200);
        // Search should not fire after dispose
        expect(mockFtsSearch).not.toHaveBeenCalled();
    });

    it("cancel() discards an in-flight search's results", async () => {
        const scope = effectScope();
        let result: any;
        let resolveSearch: (v: ReturnType<typeof makeResult>[]) => void = () => {};
        scope.run(() => {
            const queryRef = ref("quantum physics test");
            mockFtsSearch.mockReturnValue(new Promise((r) => (resolveSearch = r)));
            result = useFtsSearch(queryRef, { debounceMs: "manual" });
        });

        result.runSearch();
        await nextTick();
        expect(result.isSearching.value).toBe(true);

        // User clears the query / hits revert before the search resolves.
        result.cancel();
        expect(result.isSearching.value).toBe(false);

        // The slow search now resolves — its results must be discarded.
        resolveSearch([makeResult("stale")]);
        await vi.advanceTimersByTimeAsync(10);

        expect(result.results.value).toEqual([]);
        scope.stop();
    });

    it("query change invalidates an in-flight search before debounce fires", async () => {
        const scope = effectScope();
        let result: any;
        let resolveFirst: (v: ReturnType<typeof makeResult>[]) => void = () => {};
        const queryRef = ref("first query");
        scope.run(() => {
            mockFtsSearch.mockReturnValueOnce(new Promise((r) => (resolveFirst = r)));
            mockFtsSearch.mockResolvedValue([makeResult("new")]);
            result = useFtsSearch(queryRef, { debounceMs: 50 });
        });

        // First debounced search starts and hangs.
        await vi.advanceTimersByTimeAsync(60);
        expect(result.isSearching.value).toBe(true);

        // User keeps typing — query changes before the slow first search resolves.
        queryRef.value = "second query";
        await nextTick();

        // Stale first search resolves; must be discarded.
        resolveFirst([makeResult("stale")]);
        await vi.advanceTimersByTimeAsync(10);
        expect(result.results.value).not.toContainEqual(expect.objectContaining({ docId: "stale" }));

        // New debounced search proceeds normally.
        await vi.advanceTimersByTimeAsync(60);
        expect(result.results.value).toEqual([makeResult("new")]);
        scope.stop();
    });

    it("reactive debounceMs ref restarts watcher on change", async () => {
        const scope = effectScope();
        const debounceRef = ref<number | "manual">("manual");
        const queryRef = ref("quantum physics test");
        scope.run(() => {
            mockFtsSearch.mockResolvedValue([]);
            useFtsSearch(queryRef, { debounceMs: debounceRef });
        });

        // In manual mode, search should not fire
        await vi.advanceTimersByTimeAsync(500);
        expect(mockFtsSearch).not.toHaveBeenCalled();

        // Switch to auto mode with short debounce
        debounceRef.value = 50;
        await nextTick();

        // Now it should fire after debounce
        await vi.advanceTimersByTimeAsync(100);
        expect(mockFtsSearch).toHaveBeenCalled();
        scope.stop();
    });

    // ── Routing (local vs server-side /fts) ────────────────────────────────────

    async function runOnce(setup: () => any) {
        const scope = effectScope();
        let result: any;
        scope.run(() => {
            result = setup();
        });
        await vi.advanceTimersByTimeAsync(60);
        await vi.advanceTimersByTimeAsync(10);
        return { result, scope };
    }

    it("offline routes to local and flags partial when a cutoff is set", async () => {
        isConnected.value = false;
        initConfig({ ...CUTOFF } as any);
        mockFtsSearch.mockResolvedValue([makeResult("1")]);
        const { result, scope } = await runOnce(() =>
            useFtsSearch(ref("garden plants"), { debounceMs: 50 }),
        );
        expect(mockFtsSearch).toHaveBeenCalled();
        expect(mockFtsSearchApi).not.toHaveBeenCalled();
        expect(result.source.value).toBe("local");
        expect(result.isPartial.value).toBe(true);
        scope.stop();
    });

    it("online with no cutoff routes to local and is not partial (full sync)", async () => {
        isConnected.value = true;
        initConfig({ ...NO_CUTOFF } as any);
        mockFtsSearch.mockResolvedValue([makeResult("1")]);
        const { result, scope } = await runOnce(() =>
            useFtsSearch(ref("garden plants"), { debounceMs: 50 }),
        );
        expect(mockFtsSearch).toHaveBeenCalled();
        expect(mockFtsSearchApi).not.toHaveBeenCalled();
        expect(result.source.value).toBe("local");
        expect(result.isPartial.value).toBe(false);
        scope.stop();
    });

    it("online with a cutoff routes to the API", async () => {
        isConnected.value = true;
        initConfig({ ...CUTOFF } as any);
        mockFtsSearchApi.mockResolvedValue([makeResult("a1")]);
        const { result, scope } = await runOnce(() =>
            useFtsSearch(ref("garden plants"), { debounceMs: 50 }),
        );
        expect(mockFtsSearchApi).toHaveBeenCalled();
        expect(mockFtsSearch).not.toHaveBeenCalled();
        expect(result.source.value).toBe("api");
        expect(result.isPartial.value).toBe(false);
        scope.stop();
    });

    it("CMS with no cutoff routes to local (its full local index is authoritative)", async () => {
        isConnected.value = true;
        initConfig({ ...NO_CUTOFF, cms: true } as any);
        mockFtsSearch.mockResolvedValue([makeResult("1")]);
        const { result, scope } = await runOnce(() =>
            useFtsSearch(ref("garden plants"), { debounceMs: 50 }),
        );
        expect(mockFtsSearch).toHaveBeenCalled();
        expect(mockFtsSearchApi).not.toHaveBeenCalled();
        expect(result.source.value).toBe("local");
        expect(result.isPartial.value).toBe(false);
        scope.stop();
    });

    it("falls back to local (partial) when the API search fails", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        isConnected.value = true;
        initConfig({ ...CUTOFF } as any);
        mockFtsSearchApi.mockRejectedValue(new Error("boom"));
        mockFtsSearch.mockResolvedValue([makeResult("local1")]);
        const { result, scope } = await runOnce(() =>
            useFtsSearch(ref("garden plants"), { debounceMs: 50 }),
        );
        expect(mockFtsSearchApi).toHaveBeenCalled();
        expect(mockFtsSearch).toHaveBeenCalled();
        expect(result.source.value).toBe("local");
        expect(result.isPartial.value).toBe(true);
        expect(result.results.value).toEqual([makeResult("local1")]);
        warnSpy.mockRestore();
        scope.stop();
    });

    it("re-runs against the API when connectivity returns (upgrades partial)", async () => {
        isConnected.value = false;
        initConfig({ ...CUTOFF } as any);
        mockFtsSearch.mockResolvedValue([makeResult("local1")]);
        mockFtsSearchApi.mockResolvedValue([makeResult("api1")]);
        const { result, scope } = await runOnce(() =>
            useFtsSearch(ref("garden plants"), { debounceMs: 50 }),
        );
        expect(result.source.value).toBe("local");
        expect(result.isPartial.value).toBe(true);

        // Come online → reconnect watcher re-runs the search against the API
        isConnected.value = true;
        await nextTick();
        await vi.advanceTimersByTimeAsync(10);

        expect(mockFtsSearchApi).toHaveBeenCalled();
        expect(result.source.value).toBe("api");
        expect(result.isPartial.value).toBe(false);
        scope.stop();
    });

    it("loadMore stays on the API source for the current search", async () => {
        isConnected.value = true;
        initConfig({ ...CUTOFF } as any);
        const fullPage = Array.from({ length: 20 }, (_, i) => makeResult(`a-${i}`));
        mockFtsSearchApi.mockResolvedValue(fullPage);
        const { result, scope } = await runOnce(() =>
            useFtsSearch(ref("garden plants"), { debounceMs: 50, pageSize: 20 }),
        );
        expect(result.hasMore.value).toBe(true);

        mockFtsSearchApi.mockResolvedValue([makeResult("a-20")]);
        result.loadMore();
        await vi.advanceTimersByTimeAsync(10);

        expect(result.totalLoaded.value).toBe(21);
        expect(mockFtsSearch).not.toHaveBeenCalled(); // never fell back to local
        scope.stop();
    });
});
