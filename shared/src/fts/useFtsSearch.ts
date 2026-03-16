import { ref, watch, type Ref, getCurrentScope, onScopeDispose } from "vue";
import { ftsSearch } from "./ftsSearch";
import type { FtsSearchResult } from "./types";

export type UseFtsSearchOptions = {
    languageId?: Ref<string | undefined>;
    /** Debounce delay in ms before running search. Use 0 or 'manual' to only search when runSearch() is called. */
    debounceMs?: number | "manual";
    pageSize?: number;
    maxTrigramDocPercent?: number;
};

export type UseFtsSearchReturn = {
    results: Ref<FtsSearchResult[]>;
    isSearching: Ref<boolean>;
    loadMore: () => Promise<void>;
    hasMore: Ref<boolean>;
    totalLoaded: Ref<number>;
    lastSearchedQuery: Ref<string>;
    runSearch: (() => void) | undefined;
};

/**
 * Vue composable for full-text search with debouncing and infinite scroll support.
 * Search is fully async and non-blocking — each IndexedDB query yields to the event loop.
 */
export function useFtsSearch(
    queryRef: Ref<string>,
    options: UseFtsSearchOptions = {},
): UseFtsSearchReturn {
    const { debounceMs = 300, pageSize = 20, maxTrigramDocPercent } = options;
    const triggerOnly = debounceMs === "manual" || debounceMs === 0;

    const results = ref<FtsSearchResult[]>([]);
    const isSearching = ref(false);
    const totalLoaded = ref(0);
    const hasMore = ref(false);
    /** When using triggerOnly, this is the query last passed to doSearch (so UI can show "no results" vs "press Go"). */
    const lastSearchedQuery = ref("");

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let currentQuery = "";
    let searchGeneration = 0;

    async function doSearch(query: string, offset: number, append: boolean) {
        if (!query || query.length < 3) {
            if (!append) {
                results.value = [];
                totalLoaded.value = 0;
                hasMore.value = false;
                lastSearchedQuery.value = "";
            }
            isSearching.value = false;
            return;
        }

        if (!append) lastSearchedQuery.value = query;

        // Track generation to discard stale results from superseded searches
        const generation = ++searchGeneration;

        isSearching.value = true;
        try {
            const searchResults = await ftsSearch({
                query,
                languageId: options.languageId?.value,
                limit: pageSize,
                offset,
                maxTrigramDocPercent,
            });

            // Discard if a newer search was started while this one was running
            if (generation !== searchGeneration) return;

            if (append) {
                results.value = [...results.value, ...searchResults];
            } else {
                results.value = searchResults;
            }
            totalLoaded.value = offset + searchResults.length;
            hasMore.value = searchResults.length === pageSize;
        } catch (e) {
            console.error("FTS search error:", e);
        } finally {
            // Only clear searching state if this is still the active search
            if (generation === searchGeneration) {
                isSearching.value = false;
            }
        }
    }

    async function loadMore() {
        if (isSearching.value || !hasMore.value) return;
        await doSearch(currentQuery, totalLoaded.value, true);
    }

    function runSearch() {
        const q = queryRef.value.trim();
        currentQuery = q;
        doSearch(q, 0, false);
    }

    // Watch query with debounce (unless trigger-only mode)
    if (!triggerOnly) {
        watch(
            queryRef,
            (newQuery) => {
                if (debounceTimer) clearTimeout(debounceTimer);
                currentQuery = newQuery;
                debounceTimer = setTimeout(() => {
                    doSearch(newQuery, 0, false);
                }, debounceMs as number);
            },
            { immediate: true },
        );
    }

    // Watch language changes — re-search immediately with current query
    if (options.languageId) {
        watch(options.languageId, () => {
            if (currentQuery) {
                doSearch(currentQuery, 0, false);
            }
        });
    }

    // Cleanup timer on scope dispose
    if (getCurrentScope()) {
        onScopeDispose(() => {
            if (debounceTimer) clearTimeout(debounceTimer);
        });
    }

    return {
        results,
        isSearching,
        loadMore,
        hasMore,
        totalLoaded,
        lastSearchedQuery,
        runSearch: triggerOnly ? runSearch : undefined,
    };
}
