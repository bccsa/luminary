import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { nextTick } from "vue";
import {
    recordSearchQuery,
    loadRecentSearches,
    loadSearchQueries,
    extractSearchQueries,
    searchVersion,
    MAX_SEARCH_QUERIES,
    MAX_SEARCH_QUERY_LENGTH,
} from "./searchQueryStore";

describe("searchQueryStore", () => {
    beforeEach(() => {
        localStorage.clear();
        searchVersion.value = 0;
    });

    afterEach(() => localStorage.clear());

    it("records a submitted query, moves it to front on repeat, and caps the list", () => {
        recordSearchQuery("climate");
        recordSearchQuery("prayer");
        expect(loadRecentSearches()).toEqual(["prayer", "climate"]);

        // Re-submitting moves the existing term to the front (dedup), not appended.
        recordSearchQuery("climate");
        expect(loadRecentSearches()).toEqual(["climate", "prayer"]);

        // Cap at RECENT_SEARCHES_MAX (10): oldest drop off the back.
        for (let i = 0; i < 12; i++) recordSearchQuery(`term-${i}`);
        expect(loadRecentSearches()).toHaveLength(10);
        expect(loadRecentSearches()[0]).toBe("term-11");
    });

    it("ignores queries that are too short", () => {
        recordSearchQuery("ab");
        recordSearchQuery("");
        recordSearchQuery("   ");
        expect(loadRecentSearches()).toEqual([]);
    });

    it("bumps searchVersion on every write so feeds can react", async () => {
        const before = searchVersion.value;
        recordSearchQuery("climate");
        expect(searchVersion.value).toBe(before + 1);
        // A no-op write (too short) does not bump the version.
        const before2 = searchVersion.value;
        recordSearchQuery("x");
        expect(searchVersion.value).toBe(before2);
        await nextTick();
    });

    it("loadSearchQueries returns a bounded, recent-first, deduplicated, normalized set", () => {
        recordSearchQuery("climate change");
        recordSearchQuery("Prayer"); // different case, should dedup with "prayer"
        recordSearchQuery("prayer");
        recordSearchQuery("health");

        const queries = loadSearchQueries().map((q) => q.query);
        // recent-first: health, prayer, climate change (Prayer deduped against prayer)
        expect(queries).toEqual(["health", "prayer", "climate change"]);
        expect(queries.length).toBeLessThanOrEqual(MAX_SEARCH_QUERIES);
    });

    it("truncates very long queries to the bounded length", () => {
        const long = "a".repeat(MAX_SEARCH_QUERY_LENGTH + 50);
        recordSearchQuery(long);
        const queries = loadSearchQueries();
        expect(queries[0].query.length).toBe(MAX_SEARCH_QUERY_LENGTH);
    });

    it("extractSearchQueries is pure and bounds without touching storage", () => {
        expect(extractSearchQueries(["climate", "prayer", "ab", "climate"])).toEqual([
            { query: "climate" },
            { query: "prayer" },
        ]);
        // Caps at MAX_SEARCH_QUERIES, recent-first.
        const many = Array.from({ length: 10 }, (_, i) => `term-${i}`);
        expect(extractSearchQueries(many)).toHaveLength(MAX_SEARCH_QUERIES);
        expect(extractSearchQueries(many)[0].query).toBe("term-0");
    });
});