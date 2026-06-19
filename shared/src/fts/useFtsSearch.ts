import { ref, watch, type Ref, getCurrentScope, onScopeDispose, isRef, type WatchStopHandle } from "vue";
import { ftsSearch } from "./ftsSearch";
import { ftsSearchApi, shouldUseApiFts } from "./ftsSearchApi";
import { getContentPublishDateCutoff } from "../config";
import { isConnected } from "../socket/socketio";
import { OPEN_MIN } from "../api/sync/utils";
import type { FtsSearchOptions, FtsSearchResult, FtsSort } from "./types";
import type { DocType, PublishStatus } from "../types";

/**
 * Reactive non-language filters forwarded to each search. Changing the ref triggers a
 * fresh search (same as changing `languageId`). All fields are optional and only narrow
 * when present. See {@link FtsSearchOptions}.
 */
export type FtsFilterOptions = {
    types?: DocType[];
    tags?: string[];
    status?: PublishStatus;
    publishedAfter?: number;
    publishedBefore?: number;
    /** Strict mode: require every query word (≥3 chars) as a substring of title/author. */
    matchAllWords?: boolean;
    /** Strict mode: order by this field/direction instead of relevance. */
    sort?: FtsSort;
};

export type UseFtsSearchOptions = {
    languageId?: Ref<string | undefined>;
    /** Reactive extra filters (type/tag/status/publishDate). A change re-runs the search. */
    filters?: Ref<FtsFilterOptions | undefined>;
    /** Debounce delay in ms before running search. Use 0 or 'manual' to only search when runSearch() is called. */
    debounceMs?: number | "manual" | Ref<number | "manual">;
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
    /** Run a search immediately (useful for manual mode and forcing refresh on reopen). */
    runSearch: () => void;
    /** Invalidate any in-flight search and cancel a pending debounced run. Does not clear results. */
    cancel: () => void;
    /** Where the current results came from: "local" (offline index) or "api" (server-side /fts). */
    source: Ref<"local" | "api">;
    /**
     * True when the showing results are an incomplete (recent-only) view: local search while a
     * `publishDate` sync cutoff is in effect — i.e. offline with selective sync, or an API-failure
     * fallback. False when full sync, or when complete API results are shown. UI can surface this
     * (e.g. "showing offline results — connect for full search").
     */
    isPartial: Ref<boolean>;
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
    const getDebounce = () => (isRef(debounceMs) ? debounceMs.value : debounceMs);
    const isTriggerOnly = () => {
        const d = getDebounce();
        return d === "manual" || d === 0;
    };

    const results = ref<FtsSearchResult[]>([]);
    const isSearching = ref(false);
    const totalLoaded = ref(0);
    const hasMore = ref(false);
    const source = ref<"local" | "api">("local");
    const isPartial = ref(false);
    /** When using triggerOnly, this is the query last passed to doSearch (so UI can show "no results" vs "press Go"). */
    const lastSearchedQuery = ref("");

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let currentQuery = "";
    let searchGeneration = 0;
    /** Route chosen at the start of the current search (offset 0); reused by loadMore so pages don't split across sources. */
    let activeUseApi = false;

    const cutoffSet = () => getContentPublishDateCutoff() !== OPEN_MIN;

    /**
     * Run one page against the chosen engine. On the initial search (offset 0) an API failure
     * falls back to local results; on load-more pages it does not (to avoid mixing sources within
     * one result list) and instead yields an empty page.
     */
    async function runEngine(
        query: string,
        offset: number,
        useApi: boolean,
        allowFallback: boolean,
    ): Promise<{ results: FtsSearchResult[]; usedLocal: boolean }> {
        const opts: FtsSearchOptions = {
            query,
            languageId: options.languageId?.value,
            ...(options.filters?.value ?? {}),
            limit: pageSize,
            offset,
            maxTrigramDocPercent,
        };
        if (useApi) {
            try {
                return { results: await ftsSearchApi(opts), usedLocal: false };
            } catch (e) {
                if (!allowFallback) {
                    // load-more API failure: stop paginating rather than mix in local results
                    console.warn("FTS API load-more failed:", e);
                    return { results: [], usedLocal: false };
                }
                console.warn("FTS API search failed, falling back to local:", e);
                return { results: await ftsSearch(opts), usedLocal: true };
            }
        }
        return { results: await ftsSearch(opts), usedLocal: true };
    }

    async function doSearch(query: string, offset: number, append: boolean) {
        if (!query || query.length < 3) {
            if (!append) {
                results.value = [];
                totalLoaded.value = 0;
                hasMore.value = false;
                isPartial.value = false;
                lastSearchedQuery.value = "";
            }
            isSearching.value = false;
            return;
        }

        if (!append) {
            lastSearchedQuery.value = query;
            // Decide the route once per fresh search; loadMore reuses it.
            activeUseApi = shouldUseApiFts();
        }

        // Track generation to discard stale results from superseded searches
        const generation = ++searchGeneration;

        isSearching.value = true;
        try {
            const { results: searchResults, usedLocal } = await runEngine(
                query,
                offset,
                activeUseApi,
                !append,
            );

            // Discard if a newer search was started while this one was running
            if (generation !== searchGeneration) return;

            if (append) {
                results.value = [...results.value, ...searchResults];
            } else {
                results.value = searchResults;
            }
            totalLoaded.value = offset + searchResults.length;
            hasMore.value = searchResults.length === pageSize;
            source.value = usedLocal ? "local" : "api";
            // Local results are an incomplete view only when a sync cutoff is in effect.
            isPartial.value = usedLocal && cutoffSet();
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

    function cancel() {
        // Bumping the generation invalidates any in-flight doSearch so its results are discarded.
        searchGeneration++;
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = undefined;
        }
        isSearching.value = false;
    }

    let stopQueryWatch: WatchStopHandle | null = null;

    function startQueryWatch() {
        if (stopQueryWatch) stopQueryWatch();
        stopQueryWatch = null;

        if (isTriggerOnly()) return;
        stopQueryWatch = watch(
            queryRef,
            (newQuery) => {
                if (debounceTimer) clearTimeout(debounceTimer);
                // Invalidate any in-flight search before the debounce, so a slow previous
                // doSearch can't publish stale results after the query has changed.
                searchGeneration++;
                currentQuery = newQuery;
                const d = getDebounce();
                debounceTimer = setTimeout(() => {
                    doSearch(newQuery, 0, false);
                }, typeof d === "number" ? d : 0);
            },
            { immediate: true },
        );
    }

    // Watch query with debounce (unless trigger-only mode). If debounce is reactive,
    // restart the watcher when the mode changes (e.g. desktop ↔ mobile).
    startQueryWatch();
    if (isRef(debounceMs)) {
        watch(debounceMs, () => startQueryWatch());
    }

    // Watch language changes — re-search immediately with current query
    if (options.languageId) {
        watch(options.languageId, () => {
            if (currentQuery) {
                doSearch(currentQuery, 0, false);
            }
        });
    }

    // Watch filter changes — re-search immediately with current query (deep: the ref
    // holds a plain object the caller may mutate field-by-field).
    if (options.filters) {
        watch(
            options.filters,
            () => {
                if (currentQuery) {
                    doSearch(currentQuery, 0, false);
                }
            },
            { deep: true },
        );
    }

    // Upgrade partial (offline/fallback) results when connectivity returns: re-run the
    // current search so it routes to the API and replaces the incomplete local view.
    watch(isConnected, (online) => {
        if (online && currentQuery && isPartial.value) {
            doSearch(currentQuery, 0, false);
        }
    });

    // Cleanup timer on scope dispose
    if (getCurrentScope()) {
        onScopeDispose(() => {
            if (debounceTimer) clearTimeout(debounceTimer);
            if (stopQueryWatch) stopQueryWatch();
        });
    }

    return {
        results,
        isSearching,
        loadMore,
        hasMore,
        totalLoaded,
        lastSearchedQuery,
        runSearch,
        cancel,
        source,
        isPartial,
    };
}
