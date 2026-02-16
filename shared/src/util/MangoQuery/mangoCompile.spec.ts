import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mangoCompile, clearMangoCache, getMangoCacheStats, warmMangoCompileCache } from "./mangoCompile";
import { clearAllMangoCache, clearPersistedTemplates } from "./queryCache";

describe("mangoCompile", () => {
    // ============================================
    // Basic functionality
    // ============================================

    describe("basic functionality", () => {
        it("empty selector matches all documents", () => {
            const pred = mangoCompile({});
            expect(pred({})).toBe(true);
            expect(pred({ a: 1 })).toBe(true);
        });

        it("invalid selector always returns false", () => {
            expect(mangoCompile(null as any)({})).toBe(false);
            expect(mangoCompile(undefined as any)({})).toBe(false);
        });

        it("field equality with string", () => {
            const pred = mangoCompile({ city: "NYC" });
            expect(pred({ city: "NYC" })).toBe(true);
            expect(pred({ city: "LA" })).toBe(false);
            expect(pred({})).toBe(false);
        });

        it("field equality with number", () => {
            const pred = mangoCompile({ age: 25 });
            expect(pred({ age: 25 })).toBe(true);
            expect(pred({ age: 30 })).toBe(false);
        });

        it("field equality with boolean", () => {
            const pred = mangoCompile({ active: true });
            expect(pred({ active: true })).toBe(true);
            expect(pred({ active: false })).toBe(false);
        });

        it("field equality with null", () => {
            const pred = mangoCompile({ deleted: null });
            expect(pred({ deleted: null })).toBe(true);
            expect(pred({ deleted: false })).toBe(false);
            expect(pred({})).toBe(false);
        });

        it("multiple fields (implicit AND)", () => {
            const pred = mangoCompile({ city: "NYC", active: true });
            expect(pred({ city: "NYC", active: true })).toBe(true);
            expect(pred({ city: "NYC", active: false })).toBe(false);
            expect(pred({ city: "LA", active: true })).toBe(false);
        });
    });

    // ============================================
    // Nested field access (dot notation)
    // ============================================

    describe("nested field access", () => {
        it("simple dot notation", () => {
            const pred = mangoCompile({ "imdb.rating": 8 });
            expect(pred({ imdb: { rating: 8 } })).toBe(true);
            expect(pred({ imdb: { rating: 7 } })).toBe(false);
            expect(pred({ imdb: {} })).toBe(false);
        });

        it("deep dot notation", () => {
            const pred = mangoCompile({ "a.b.c.d": "value" });
            expect(pred({ a: { b: { c: { d: "value" } } } })).toBe(true);
            expect(pred({ a: { b: { c: {} } } })).toBe(false);
        });

        it("dot notation with operators", () => {
            const pred = mangoCompile({ "stats.score": { $gte: 80 } });
            expect(pred({ stats: { score: 90 } })).toBe(true);
            expect(pred({ stats: { score: 70 } })).toBe(false);
        });
    });

    // ============================================
    // Combination operators ($and, $or, $not, $nor)
    // ============================================

    describe("combination operators", () => {
        it("$or matches if any condition matches", () => {
            const pred = mangoCompile({ $or: [{ city: "LA" }, { score: { $gte: 90 } }] });
            expect(pred({ city: "LA", score: 50 })).toBe(true);
            expect(pred({ city: "NYC", score: 95 })).toBe(true);
            expect(pred({ city: "NYC", score: 50 })).toBe(false);
        });

        it("$or throws on invalid argument", () => {
            expect(() => mangoCompile({ $or: "invalid" as any })({}).valueOf()).toThrow(
                "$or must be an array",
            );
        });

        it("$and matches if all conditions match", () => {
            const pred = mangoCompile({ $and: [{ city: "SF" }, { score: { $gte: 90 } }] });
            expect(pred({ city: "SF", score: 95 })).toBe(true);
            expect(pred({ city: "SF", score: 80 })).toBe(false);
            expect(pred({ city: "LA", score: 95 })).toBe(false);
        });

        it("$and throws on invalid argument", () => {
            expect(() => mangoCompile({ $and: "invalid" as any })({}).valueOf()).toThrow(
                "$and must be an array",
            );
        });

        it("$not negates the condition", () => {
            const pred = mangoCompile({ $not: { city: "NYC" } });
            expect(pred({ city: "LA" })).toBe(true);
            expect(pred({ city: "NYC" })).toBe(false);
        });

        it("$not with complex selector", () => {
            const pred = mangoCompile({ $not: { score: { $lt: 50 } } });
            expect(pred({ score: 60 })).toBe(true);
            expect(pred({ score: 40 })).toBe(false);
        });

        it("$not throws on invalid argument", () => {
            expect(() => mangoCompile({ $not: "invalid" as any })({}).valueOf()).toThrow(
                "$not must be a selector object",
            );
        });

        it("$nor matches if no conditions match", () => {
            const pred = mangoCompile({ $nor: [{ city: "NYC" }, { city: "LA" }] });
            expect(pred({ city: "SF" })).toBe(true);
            expect(pred({ city: "NYC" })).toBe(false);
            expect(pred({ city: "LA" })).toBe(false);
        });

        it("$nor throws on invalid argument", () => {
            expect(() => mangoCompile({ $nor: "invalid" as any })({}).valueOf()).toThrow(
                "$nor must be an array",
            );
        });

        it("nested $and/$or", () => {
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
    // Equality operators ($eq, $ne)
    // ============================================

    describe("equality operators", () => {
        it("$eq matches equal values", () => {
            const pred = mangoCompile({ city: { $eq: "NYC" } });
            expect(pred({ city: "NYC" })).toBe(true);
            expect(pred({ city: "LA" })).toBe(false);
        });

        it("$eq with numbers", () => {
            const pred = mangoCompile({ score: { $eq: 100 } });
            expect(pred({ score: 100 })).toBe(true);
            expect(pred({ score: 99 })).toBe(false);
        });

        it("$eq with null", () => {
            const pred = mangoCompile({ value: { $eq: null } });
            expect(pred({ value: null })).toBe(true);
            expect(pred({ value: undefined })).toBe(false);
        });

        it("$ne matches non-equal values", () => {
            const pred = mangoCompile({ score: { $ne: 5 } });
            expect(pred({ score: 10 })).toBe(true);
            expect(pred({ score: 5 })).toBe(false);
        });
    });

    // ============================================
    // Comparison operators ($gt, $lt, $gte, $lte)
    // ============================================

    describe("comparison operators", () => {
        it("$gt matches greater than", () => {
            const pred = mangoCompile({ score: { $gt: 10 } });
            expect(pred({ score: 15 })).toBe(true);
            expect(pred({ score: 10 })).toBe(false);
            expect(pred({ score: 5 })).toBe(false);
        });

        it("$lt matches less than", () => {
            const pred = mangoCompile({ score: { $lt: 10 } });
            expect(pred({ score: 5 })).toBe(true);
            expect(pred({ score: 10 })).toBe(false);
            expect(pred({ score: 15 })).toBe(false);
        });

        it("$gte matches greater than or equal", () => {
            const pred = mangoCompile({ score: { $gte: 10 } });
            expect(pred({ score: 15 })).toBe(true);
            expect(pred({ score: 10 })).toBe(true);
            expect(pred({ score: 5 })).toBe(false);
        });

        it("$lte matches less than or equal", () => {
            const pred = mangoCompile({ score: { $lte: 10 } });
            expect(pred({ score: 5 })).toBe(true);
            expect(pred({ score: 10 })).toBe(true);
            expect(pred({ score: 15 })).toBe(false);
        });

        it("combined range ($gte + $lte)", () => {
            const pred = mangoCompile({ score: { $gte: 50, $lte: 70 } });
            expect(pred({ score: 49 })).toBe(false);
            expect(pred({ score: 50 })).toBe(true);
            expect(pred({ score: 60 })).toBe(true);
            expect(pred({ score: 70 })).toBe(true);
            expect(pred({ score: 71 })).toBe(false);
        });

        it("string comparison", () => {
            const pred = mangoCompile({ name: { $gt: "Bob" } });
            expect(pred({ name: "Charlie" })).toBe(true);
            expect(pred({ name: "Alice" })).toBe(false);
        });
    });

    // ============================================
    // Array membership operators ($in, $nin)
    // ============================================

    describe("array membership operators", () => {
        it("$in matches if value is in array", () => {
            const pred = mangoCompile({ status: { $in: ["draft", "published"] } });
            expect(pred({ status: "draft" })).toBe(true);
            expect(pred({ status: "published" })).toBe(true);
            expect(pred({ status: "archived" })).toBe(false);
        });

        it("$in returns false for non-array argument", () => {
            const pred = mangoCompile({ score: { $in: 10 as any } });
            expect(pred({ score: 10 })).toBe(false);
        });

        it("$nin matches if value is not in array", () => {
            const pred = mangoCompile({ status: { $nin: ["archived", "deleted"] } });
            expect(pred({ status: "active" })).toBe(true);
            expect(pred({ status: "archived" })).toBe(false);
        });

        it("$nin returns false for non-array argument", () => {
            const pred = mangoCompile({ score: { $nin: 10 as any } });
            expect(pred({ score: 10 })).toBe(false);
        });
    });

    // ============================================
    // Array field operators ($all, $elemMatch, $allMatch, $size)
    // ============================================

    describe("array field operators", () => {
        it("$all matches if array contains all elements", () => {
            const pred = mangoCompile({ tags: { $all: ["a", "b"] } });
            expect(pred({ tags: ["a", "b", "c"] })).toBe(true);
            expect(pred({ tags: ["a", "c"] })).toBe(false);
            expect(pred({ tags: [] })).toBe(false);
        });

        it("$all with single element", () => {
            const pred = mangoCompile({ tags: { $all: ["a"] } });
            expect(pred({ tags: ["a", "b"] })).toBe(true);
            expect(pred({ tags: ["b"] })).toBe(false);
        });

        it("$elemMatch matches if any element matches selector", () => {
            const pred = mangoCompile({ items: { $elemMatch: { price: { $gt: 100 } } } });
            expect(pred({ items: [{ price: 50 }, { price: 150 }] })).toBe(true);
            expect(pred({ items: [{ price: 50 }, { price: 60 }] })).toBe(false);
        });

        it("$elemMatch with $eq on primitive array", () => {
            const pred = mangoCompile({ genre: { $elemMatch: { $eq: "Horror" } } });
            expect(pred({ genre: ["Action", "Horror"] })).toBe(true);
            expect(pred({ genre: ["Action", "Comedy"] })).toBe(false);
        });

        it("$allMatch matches if all elements match selector", () => {
            const pred = mangoCompile({ scores: { $allMatch: { $gte: 50 } } });
            expect(pred({ scores: [60, 70, 80] })).toBe(true);
            expect(pred({ scores: [40, 70, 80] })).toBe(false);
        });

        it("$allMatch returns false for empty array", () => {
            const pred = mangoCompile({ scores: { $allMatch: { $gte: 50 } } });
            expect(pred({ scores: [] })).toBe(false);
        });

        it("$size matches array length", () => {
            const pred = mangoCompile({ tags: { $size: 3 } });
            expect(pred({ tags: ["a", "b", "c"] })).toBe(true);
            expect(pred({ tags: ["a", "b"] })).toBe(false);
        });

        it("$size returns false for non-number argument", () => {
            const pred = mangoCompile({ tags: { $size: "3" as any } });
            expect(pred({ tags: ["a", "b", "c"] })).toBe(false);
        });
    });

    // ============================================
    // Object/field operators ($exists, $type, $keyMapMatch)
    // ============================================

    describe("object/field operators", () => {
        it("$exists true matches when field exists", () => {
            const pred = mangoCompile({ email: { $exists: true } });
            expect(pred({ email: "test@example.com" })).toBe(true);
            expect(pred({ email: null })).toBe(true);
            expect(pred({})).toBe(false);
        });

        it("$exists false matches when field does not exist", () => {
            const pred = mangoCompile({ deleted: { $exists: false } });
            expect(pred({})).toBe(true);
            expect(pred({ deleted: true })).toBe(false);
        });

        it("$exists with nested field", () => {
            const pred = mangoCompile({ "user.email": { $exists: true } });
            expect(pred({ user: { email: "test@example.com" } })).toBe(true);
            expect(pred({ user: {} })).toBe(false);
        });

        it("$type null", () => {
            const pred = mangoCompile({ value: { $type: "null" } });
            expect(pred({ value: null })).toBe(true);
            expect(pred({ value: 0 })).toBe(false);
        });

        it("$type boolean", () => {
            const pred = mangoCompile({ active: { $type: "boolean" } });
            expect(pred({ active: true })).toBe(true);
            expect(pred({ active: 1 })).toBe(false);
        });

        it("$type number", () => {
            const pred = mangoCompile({ count: { $type: "number" } });
            expect(pred({ count: 42 })).toBe(true);
            expect(pred({ count: "42" })).toBe(false);
        });

        it("$type string", () => {
            const pred = mangoCompile({ name: { $type: "string" } });
            expect(pred({ name: "Alice" })).toBe(true);
            expect(pred({ name: 123 })).toBe(false);
        });

        it("$type array", () => {
            const pred = mangoCompile({ tags: { $type: "array" } });
            expect(pred({ tags: [1, 2, 3] })).toBe(true);
            expect(pred({ tags: "not array" })).toBe(false);
        });

        it("$type object", () => {
            const pred = mangoCompile({ meta: { $type: "object" } });
            expect(pred({ meta: { key: "value" } })).toBe(true);
            expect(pred({ meta: [1, 2, 3] })).toBe(false);
            expect(pred({ meta: null })).toBe(false);
        });

        it("$keyMapMatch matches if any key matches selector", () => {
            const pred = mangoCompile({ cameras: { $keyMapMatch: { $eq: "secondary" } } });
            expect(pred({ cameras: { primary: {}, secondary: {} } })).toBe(true);
            expect(pred({ cameras: { primary: {} } })).toBe(false);
        });
    });

    // ============================================
    // String/pattern operators ($regex, $beginsWith)
    // ============================================

    describe("string/pattern operators", () => {
        it("$regex matches pattern", () => {
            const pred = mangoCompile({ title: { $regex: "^The" } });
            expect(pred({ title: "The Matrix" })).toBe(true);
            expect(pred({ title: "Matrix" })).toBe(false);
        });

        it("$regex case sensitivity", () => {
            const pred = mangoCompile({ title: { $regex: "matrix" } });
            expect(pred({ title: "The Matrix" })).toBe(false);
            const pred2 = mangoCompile({ title: { $regex: "[Mm]atrix" } });
            expect(pred2({ title: "The Matrix" })).toBe(true);
        });

        it("$regex returns false for non-string field", () => {
            const pred = mangoCompile({ count: { $regex: "\\d+" } });
            expect(pred({ count: 123 })).toBe(false);
        });

        it("$regex returns false for invalid pattern", () => {
            const pred = mangoCompile({ title: { $regex: "[invalid" } });
            expect(pred({ title: "test" })).toBe(false);
        });

        it("$beginsWith matches prefix", () => {
            const pred = mangoCompile({ name: { $beginsWith: "John" } });
            expect(pred({ name: "John" })).toBe(true);
            expect(pred({ name: "Johnny" })).toBe(true);
            expect(pred({ name: "John Doe" })).toBe(true);
            expect(pred({ name: "Jane" })).toBe(false);
        });

        it("$beginsWith is case sensitive", () => {
            const pred = mangoCompile({ name: { $beginsWith: "john" } });
            expect(pred({ name: "John" })).toBe(false);
        });

        it("$beginsWith returns false for non-string field", () => {
            const pred = mangoCompile({ count: { $beginsWith: "1" } });
            expect(pred({ count: 123 })).toBe(false);
        });
    });

    // ============================================
    // Numeric operators ($mod)
    // ============================================

    describe("numeric operators", () => {
        it("$mod matches modulo result", () => {
            const pred = mangoCompile({ value: { $mod: [10, 1] } });
            expect(pred({ value: 11 })).toBe(true);
            expect(pred({ value: 21 })).toBe(true);
            expect(pred({ value: 31 })).toBe(true);
            expect(pred({ value: 10 })).toBe(false);
        });

        it("$mod returns false for non-integer values", () => {
            const pred = mangoCompile({ value: { $mod: [10, 1] } });
            expect(pred({ value: 11.5 })).toBe(false);
        });

        it("$mod returns false for invalid arguments", () => {
            expect(mangoCompile({ value: { $mod: [0, 1] } })({ value: 11 })).toBe(false);
            expect(mangoCompile({ value: { $mod: [10] as any } })({ value: 11 })).toBe(false);
            expect(mangoCompile({ value: { $mod: "invalid" as any } })({ value: 11 })).toBe(false);
        });
    });

    // ============================================
    // Complex queries
    // ============================================

    describe("complex queries", () => {
        it("CouchDB-style complex query", () => {
            const pred = mangoCompile({
                $and: [
                    { year: { $gte: 1900, $lte: 1903 } },
                    { $not: { year: 1901 } },
                ],
            });
            expect(pred({ year: 1900 })).toBe(true);
            expect(pred({ year: 1901 })).toBe(false);
            expect(pred({ year: 1902 })).toBe(true);
            expect(pred({ year: 1903 })).toBe(true);
            expect(pred({ year: 1904 })).toBe(false);
        });

        it("deeply nested $or and $and", () => {
            const pred = mangoCompile({
                $or: [
                    { $and: [{ type: "a" }, { status: "active" }] },
                    { $and: [{ type: "b" }, { score: { $gt: 50 } }] },
                ],
            });
            expect(pred({ type: "a", status: "active", score: 10 })).toBe(true);
            expect(pred({ type: "b", status: "inactive", score: 60 })).toBe(true);
            expect(pred({ type: "a", status: "inactive", score: 60 })).toBe(false);
            expect(pred({ type: "b", status: "active", score: 40 })).toBe(false);
        });

        it("nested object equality uses $eq", () => {
            // Note: { imdb: { rating: 8 } } is interpreted as field criteria, not object equality
            // Use $eq for explicit object equality
            const pred = mangoCompile({ imdb: { $eq: { rating: 8 } } });
            expect(pred({ imdb: { rating: 8 } })).toBe(true);
            expect(pred({ imdb: { rating: 7 } })).toBe(false);
            expect(pred({ imdb: { rating: 8, extra: "field" } })).toBe(false);
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

    // ============================================
    // Cache warmup from localStorage
    // ============================================

    describe("warmMangoCompileCache", () => {
        beforeEach(() => {
            clearAllMangoCache();
            clearPersistedTemplates();
            vi.useFakeTimers();
        });

        afterEach(() => {
            clearPersistedTemplates();
            vi.useRealTimers();
        });

        it("warms compile cache from persisted templates", () => {
            // Execute a query to populate in-memory cache + persist template
            const pred1 = mangoCompile({ type: "post", status: "published" });
            expect(pred1({ type: "post", status: "published" })).toBe(true);

            // Flush persistence
            vi.advanceTimersByTime(300);
            expect(localStorage.getItem("mango_tpl_cache")).not.toBeNull();

            // Clear in-memory cache (simulates page reload)
            clearAllMangoCache();
            expect(getMangoCacheStats().size).toBe(0);

            // Warm from localStorage
            warmMangoCompileCache();

            // Cache should now be populated
            expect(getMangoCacheStats().size).toBe(1);

            // Queries with same structure should hit cache
            const pred2 = mangoCompile({ type: "page", status: "draft" });
            expect(pred2({ type: "page", status: "draft" })).toBe(true);
            expect(pred2({ type: "post", status: "draft" })).toBe(false);
        });

        it("is a no-op when localStorage is empty", () => {
            warmMangoCompileCache();
            expect(getMangoCacheStats().size).toBe(0);
        });
    });
});
