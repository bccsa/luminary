import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, effectScope, nextTick } from "vue";

vi.mock("./ftsSearch", () => ({
    ftsSearch: vi.fn(),
}));

import { useFtsSearch } from "./useFtsSearch";
import { ftsSearch } from "./ftsSearch";

const mockFtsSearch = vi.mocked(ftsSearch);

describe("useFtsSearch", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        mockFtsSearch.mockResolvedValue([]);
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
            mockFtsSearch.mockResolvedValue([{ docId: "1", score: 1, wordMatchScore: 0 }]);
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
            const fullPage = Array.from({ length: 20 }, (_, i) => ({
                docId: `doc-${i}`,
                score: 1,
                wordMatchScore: 0,
            }));
            mockFtsSearch.mockResolvedValue(fullPage);
            result = useFtsSearch(queryRef, { debounceMs: 50, pageSize: 20 });
        });

        await vi.advanceTimersByTimeAsync(100);
        // Wait for the async search to resolve
        await vi.advanceTimersByTimeAsync(10);

        expect(result.hasMore.value).toBe(true);
        expect(result.totalLoaded.value).toBe(20);

        // Load more
        mockFtsSearch.mockResolvedValue([{ docId: "doc-20", score: 0.5, wordMatchScore: 0 }]);
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
            mockFtsSearch.mockResolvedValue([{ docId: "1", score: 1, wordMatchScore: 0 }]);
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
            mockFtsSearch.mockResolvedValue([{ docId: "1", score: 1, wordMatchScore: 0 }]);
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
            mockFtsSearch.mockResolvedValue([{ docId: "1", score: 1, wordMatchScore: 0 }]);
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
});
