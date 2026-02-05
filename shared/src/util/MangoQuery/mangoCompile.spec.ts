import { describe, it, expect, beforeEach } from "vitest";
import { mangoCompile, clearMangoCache, getMangoCacheStats } from "./mangoCompile";

describe("mangoCompile", () => {
    // ============================================
    // Basic functionality (verify caching layer works correctly)
    // ============================================

    describe("basic functionality", () => {
        beforeEach(() => {
            clearMangoCache();
        });

        it("compiles and executes queries correctly", () => {
            const pred = mangoCompile({ city: "NYC", score: { $gte: 80 } });
            expect(pred({ city: "NYC", score: 90 })).toBe(true);
            expect(pred({ city: "NYC", score: 70 })).toBe(false);
            expect(pred({ city: "LA", score: 90 })).toBe(false);
        });

        it("handles empty selector", () => {
            const pred = mangoCompile({});
            expect(pred({})).toBe(true);
            expect(pred({ a: 1 })).toBe(true);
        });

        it("handles invalid selector", () => {
            const pred = mangoCompile(null as any);
            expect(pred({})).toBe(false);
        });

        it("handles nested queries with $and/$or", () => {
            const pred = mangoCompile({
                $and: [{ type: "movie" }, { $or: [{ year: 2020 }, { year: 2021 }] }],
            });
            expect(pred({ type: "movie", year: 2020 })).toBe(true);
            expect(pred({ type: "movie", year: 2021 })).toBe(true);
            expect(pred({ type: "movie", year: 2019 })).toBe(false);
            expect(pred({ type: "show", year: 2020 })).toBe(false);
        });
    });

    // ============================================
    // Caching mechanism
    // ============================================

    describe("caching", () => {
        beforeEach(() => {
            clearMangoCache();
        });

        it("caches compiled queries", () => {
            const query = { city: "NYC", score: { $gte: 80 } };

            // First call - should compile and cache
            const pred1 = mangoCompile(query);
            const stats1 = getMangoCacheStats();
            expect(stats1.size).toBe(1);

            // Second call with same query - should return cached
            const pred2 = mangoCompile(query);
            const stats2 = getMangoCacheStats();
            expect(stats2.size).toBe(1); // Still only 1 entry

            // Both predicates should work identically
            expect(pred1({ city: "NYC", score: 90 })).toBe(true);
            expect(pred2({ city: "NYC", score: 90 })).toBe(true);
            expect(pred1({ city: "NYC", score: 70 })).toBe(false);
            expect(pred2({ city: "NYC", score: 70 })).toBe(false);
        });

        it("caches queries with same structure but different values together (template-based)", () => {
            // With template-based caching, queries with the same structure share a cache entry
            const query1 = { city: "NYC" };
            const query2 = { city: "LA" }; // Same structure as query1, different value
            const query3 = { score: { $gt: 50 } }; // Different structure

            mangoCompile(query1);
            mangoCompile(query2);
            mangoCompile(query3);

            const stats = getMangoCacheStats();
            // query1 and query2 share the same template { city: $0 }
            // query3 has a different template { score: { $gt: $0 } }
            expect(stats.size).toBe(2);

            // Both predicates still work correctly with their bound values
            const pred1 = mangoCompile(query1);
            const pred2 = mangoCompile(query2);
            expect(pred1({ city: "NYC" })).toBe(true);
            expect(pred1({ city: "LA" })).toBe(false);
            expect(pred2({ city: "LA" })).toBe(true);
            expect(pred2({ city: "NYC" })).toBe(false);
        });

        it("caches structurally different queries separately", () => {
            const query1 = { city: "NYC" };
            const query2 = { name: "Alice" }; // Different field
            const query3 = { score: { $gt: 50 } }; // Different operator

            mangoCompile(query1);
            mangoCompile(query2);
            mangoCompile(query3);

            const stats = getMangoCacheStats();
            expect(stats.size).toBe(3);
        });

        it("caches based on exact query structure (key order matters)", () => {
            // These queries are semantically identical but have different key orders
            // For performance, we don't normalize key order - each is cached separately
            const query1 = { city: "NYC", score: 100 };
            const query2 = { score: 100, city: "NYC" };

            mangoCompile(query1);
            const stats1 = getMangoCacheStats();
            expect(stats1.size).toBe(1);

            mangoCompile(query2);
            const stats2 = getMangoCacheStats();
            // Different key order = different cache entry (acceptable tradeoff for faster hashing)
            expect(stats2.size).toBe(2);

            // Both predicates still work correctly
            const pred1 = mangoCompile(query1);
            const pred2 = mangoCompile(query2);
            expect(pred1({ city: "NYC", score: 100 })).toBe(true);
            expect(pred2({ city: "NYC", score: 100 })).toBe(true);
        });

        it("clearMangoCache removes all cached entries", () => {
            mangoCompile({ a: 1 });
            mangoCompile({ b: 2 });
            mangoCompile({ c: 3 });

            expect(getMangoCacheStats().size).toBe(3);

            clearMangoCache();

            expect(getMangoCacheStats().size).toBe(0);
        });

        it("does not cache invalid queries", () => {
            mangoCompile(null as any);
            mangoCompile(undefined as any);

            expect(getMangoCacheStats().size).toBe(0);
        });

        it("does not cache empty queries", () => {
            mangoCompile({});

            expect(getMangoCacheStats().size).toBe(0);
        });

        it("getMangoCacheStats returns cache keys", () => {
            mangoCompile({ type: "post" });
            mangoCompile({ status: "active" });

            const stats = getMangoCacheStats();
            expect(stats.size).toBe(2);
            expect(stats.keys).toHaveLength(2);
            // Cache keys are now hashes, so just verify they're non-empty strings
            expect(stats.keys.every((k) => typeof k === "string" && k.length > 0)).toBe(true);
        });

        it("caches queries with nested sub-selectors efficiently", () => {
            // With template-based caching, the entire query structure is one cache entry
            mangoCompile({ $or: [{ city: "NYC" }, { city: "LA" }] });

            const stats = getMangoCacheStats();
            // Template caching caches the whole query as one entry
            expect(stats.size).toBe(1);

            // A standalone sub-selector query has a different structure
            mangoCompile({ city: "NYC" });
            expect(getMangoCacheStats().size).toBe(2);

            // Another query with same $or structure but different values shares the template
            mangoCompile({ $or: [{ city: "Boston" }, { city: "Chicago" }] });
            expect(getMangoCacheStats().size).toBe(2); // No new entries - same template
        });
    });
});
