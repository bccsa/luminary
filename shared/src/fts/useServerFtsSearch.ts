import { ref, watch, getCurrentScope, onScopeDispose, type Ref } from "vue";
import { getRest, type ApiFtsQuery } from "../api/RestApi";
import { config } from "../config";
import { isConnected } from "../socket/socketio";
import type { BaseDocumentDto, DocType } from "../types";
import { attachFtsLiveSync, markFtsStale } from "./ftsLiveSync";

/** Field + direction for the server strict sort. `field` is validated server-side per doctype. */
export type ServerFtsSort = { field: string; direction: "asc" | "desc" };

/** Extra filters forwarded to the server strict search (narrow only). */
export type ServerFtsFilters = {
    /** Restrict to docs whose `memberOf` intersects these group IDs. */
    groups?: string[];
};

type MaybeRefOrGetter<T> = Ref<T> | (() => T);

export type UseServerFtsSearchOptions = {
    /** The doctype to search; its server-side aux FTS config drives matchable/sortable fields. */
    docType: DocType;
    /** Reactive sort. Omit to use the server's per-doctype default ordering. */
    sort?: MaybeRefOrGetter<ServerFtsSort | undefined>;
    /** Reactive extra filters (e.g. group membership). A change re-runs the search. */
    filters?: MaybeRefOrGetter<ServerFtsFilters | undefined>;
    /** Page size (default 20). */
    pageSize?: number;
    /** Debounce delay in ms before searching, or "manual" to only search via {@link UseServerFtsSearchReturn.runSearch} (default 300). */
    debounceMs?: number | "manual";
};

export type UseServerFtsSearchReturn = {
    /** Page-accumulated result docs (trimmed, display-only — never persist to Dexie). */
    docs: Ref<Partial<BaseDocumentDto>[]>;
    isLoading: Ref<boolean>;
    hasMore: Ref<boolean>;
    loadMore: () => Promise<void>;
    /** True when live changes may have altered the result set — offer refresh. */
    isStale: Ref<boolean>;
    /** Re-run the current query from page 1 and clear {@link isStale}. */
    refresh: () => Promise<void>;
    /** Flag results stale (e.g. after creating a doc while searching). */
    markStale: () => void;
    /** Run a search immediately using the current query (for `debounceMs: "manual"`). */
    runSearch: () => void;
};

/** Minimum query length before searching (a shorter query yields no usable trigrams). */
const MIN_QUERY_CHARS = 3;

function read<T>(src: MaybeRefOrGetter<T> | undefined): T | undefined {
    if (src === undefined) return undefined;
    return typeof src === "function" ? (src as () => T)() : (src as Ref<T>).value;
}

/**
 * Server-only strict full-text search for a single doctype (e.g. User, Redirect).
 *
 * Always calls the server `/fts` endpoint in strict mode (`matchAllWords`) — substring-AND on
 * the doctype's searchable fields + sort + filters — with debouncing and infinite-scroll
 * paging. It does NOT use the offline index, so offline (or on any API error) it yields an
 * empty result set. Results are display-only (trimmed of `fts`); never persist them to Dexie.
 *
 * Distinct from {@link useFtsSearch}, which is Content-specific, BM25-ranked, and routes
 * local-vs-API by sync cutoff.
 */
export function useServerFtsSearch(
    queryRef: Ref<string>,
    options: UseServerFtsSearchOptions,
): UseServerFtsSearchReturn {
    const { docType, pageSize = 20, debounceMs = 300 } = options;
    const isTriggerOnly = debounceMs === "manual";

    const docs = ref<Partial<BaseDocumentDto>[]>([]);
    const isLoading = ref(false);
    const hasMore = ref(false);
    const isStale = ref(false);

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let generation = 0;

    async function doSearch(offset: number, append: boolean) {
        const query = queryRef.value.trim();
        if (query.length < MIN_QUERY_CHARS) {
            if (!append) {
                docs.value = [];
                hasMore.value = false;
                isStale.value = false;
            }
            isLoading.value = false;
            return;
        }

        const myGeneration = ++generation;
        isLoading.value = true;
        try {
            const filters = read(options.filters);
            const res = await getRest().fts({
                queryString: query,
                types: [docType],
                matchAllWords: true,
                sort: read(options.sort) as ApiFtsQuery["sort"],
                groups: filters?.groups,
                cms: config.cms,
                limit: pageSize,
                offset,
            });

            // Discard if a newer search superseded this one.
            if (myGeneration !== generation) return;

            // `undefined` = the HTTP layer swallowed a 4xx/5xx (e.g. offline); halt with an
            // empty page rather than showing a misleadingly "complete" empty list.
            const page = (res ?? []).map((r) => r.doc);
            docs.value = append ? [...docs.value, ...page] : page;
            hasMore.value = page.length === pageSize;
            if (!append) isStale.value = false;
        } catch (e) {
            if (myGeneration !== generation) return;
            console.warn("Server FTS search failed:", e);
            if (!append) {
                docs.value = [];
                hasMore.value = false;
            }
        } finally {
            if (myGeneration === generation) isLoading.value = false;
        }
    }

    async function loadMore() {
        if (isLoading.value || !hasMore.value) return;
        await doSearch(docs.value.length, true);
    }

    async function refresh() {
        isStale.value = false;
        await doSearch(0, false);
    }

    function runSearch() {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = undefined;
        }
        isStale.value = false;
        generation++;
        doSearch(0, false);
    }

    // Re-run on query changes (debounced). "manual" mode skips this watcher entirely — the
    // caller is expected to invoke runSearch() explicitly (e.g. on Enter/Go), mirroring
    // useFtsSearch's trigger-only mode.
    if (!isTriggerOnly) {
        watch(
            () => queryRef.value.trim(),
            () => {
                isStale.value = false;
                if (debounceTimer) clearTimeout(debounceTimer);
                // Invalidate any in-flight search before the debounce window opens.
                generation++;
                debounceTimer = setTimeout(() => doSearch(0, false), debounceMs as number);
            },
            { immediate: true },
        );
    }

    // Sort/filter changes re-run immediately regardless of query debounce mode. The JSON
    // snapshot keeps the watch robust against object-identity churn and detects deep changes.
    watch(
        () => JSON.stringify({ sort: read(options.sort) ?? null, filters: read(options.filters) ?? null }),
        () => {
            isStale.value = false;
            if (debounceTimer) clearTimeout(debounceTimer);
            generation++;
            doSearch(0, false);
        },
    );

    // Re-run when connectivity returns (an offline attempt yields nothing — server-only).
    watch(isConnected, (online) => {
        if (online && queryRef.value.trim().length >= MIN_QUERY_CHARS) doSearch(0, false);
    });

    if (getCurrentScope()) {
        attachFtsLiveSync(
            docs,
            {
                getId: (d) => d._id!,
                patch: (d, live) => ({ ...d, ...live }),
            },
            { docType, stale: isStale, query: queryRef },
        );

        onScopeDispose(() => {
            if (debounceTimer) clearTimeout(debounceTimer);
            generation++; // invalidate any in-flight search
        });
    }

    return {
        docs,
        isLoading,
        hasMore,
        loadMore,
        isStale,
        refresh,
        markStale: () => markFtsStale(isStale),
        runSearch,
    };
}
