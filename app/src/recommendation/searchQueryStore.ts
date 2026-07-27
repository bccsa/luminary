import { ref } from "vue";

/**
 * Owner of the recent-search list (`localStorage["luminary-search-recent"]`) and the
 * bridge that feeds those submitted queries into the recommendation engine.
 *
 * SearchModal writes here on every submit (Enter / Go / recent-pick). The recents list
 * backs the modal's own "recent searches" chips, and `loadSearchQueries` exposes a bounded
 * view of it that `useRecommendations` feeds into its FTS/serendipity leg — so what the user
 * searches for shapes recommendations, mirroring how saved highlights already feed that leg.
 */

const RECENT_SEARCHES_KEY = "luminary-search-recent";
/** Cap on the recent-search chips shown in the modal. */
const RECENT_SEARCHES_MAX = 10;
/** Bound local FTS work and keep each recommendation seed focused, mirroring highlights. */
export const MAX_SEARCH_QUERIES = 4;
/** A very long query is usually several ideas; keep each FTS query focused and bounded. */
export const MAX_SEARCH_QUERY_LENGTH = 160;

export type SearchQuery = {
    query: string;
};

function getStorage(): Storage | null {
    try {
        return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
        return null;
    }
}

/** Read the raw recent-search list. Corrupt/missing storage yields empty. */
export function loadRecentSearches(): string[] {
    try {
        const raw = getStorage()?.getItem(RECENT_SEARCHES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.slice(0, RECENT_SEARCHES_MAX) : [];
    } catch {
        return [];
    }
}

/**
 * IndexedDB/localStorage has no Vue reactivity. Bumped on every write so mounted
 * recommendation feeds reload their local search-query seeds.
 */
export const searchVersion = ref(0);

function notifySearchChanged() {
    searchVersion.value++;
}

function writeRecentSearches(list: string[]) {
    try {
        getStorage()?.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
    } catch {
        /* ignore */
    }
    notifySearchChanged();
}

/**
 * Record a submitted search: trim, skip <3 chars, move-to-front dedup, cap at
 * {@link RECENT_SEARCHES_MAX}, persist, and bump {@link searchVersion}. Replaces
 * SearchModal's former `pushRecentSearch`; behaviour is unchanged for the chips UI.
 */
export function recordSearchQuery(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 3) return;
    const current = loadRecentSearches();
    const next = [trimmed, ...current.filter((t) => t !== trimmed)].slice(0, RECENT_SEARCHES_MAX);
    writeRecentSearches(next);
}

/** Clear the recent-search list (the modal's "clear all" affordance). */
export function clearRecentSearches() {
    writeRecentSearches([]);
}

/**
 * Collapse whitespace and bound a single query; returns undefined for anything too short
 * to trigram-search. Kept pure so bounding can be tested without localStorage.
 */
function normalizeSearchQuery(value: string): string | undefined {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length < 3) return undefined;
    return normalized.slice(0, MAX_SEARCH_QUERY_LENGTH).trim();
}

/**
 * Extract a bounded, recent-first, deduplicated set of search queries from the raw
 * recent list — the form `useRecommendations` consumes. Mirrors `extractHighlightQueries`.
 */
export function extractSearchQueries(raw: string[]): SearchQuery[] {
    const seen = new Set<string>();
    const queries: SearchQuery[] = [];
    for (const term of raw) {
        if (typeof term !== "string") continue;
        const query = normalizeSearchQuery(term);
        if (!query) continue;
        const key = query.toLocaleLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        queries.push({ query });
        if (queries.length >= MAX_SEARCH_QUERIES) return queries;
    }
    return queries;
}

/** Best-effort bounded read for the recommendation FTS leg. Corrupt storage must not break it. */
export function loadSearchQueries(): SearchQuery[] {
    return extractSearchQueries(loadRecentSearches());
}