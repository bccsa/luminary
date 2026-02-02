import { describe, it, expect } from "vitest";
import { compileSelector } from "./compileSelector";

describe("compileSelector", () => {
    // ============================================
    // Basic selectors
    // ============================================

    describe("basic selectors", () => {
        it("matches all for empty selector", () => {
            const pred = compileSelector({});
            expect(pred({})).toBe(true);
            expect(pred({ a: 1 })).toBe(true);
        });

        it("returns false for non-object selector", () => {
            const pred = compileSelector(null as any);
            expect(pred({})).toBe(false);
        });

        it("supports field equality with string", () => {
            const pred = compileSelector({ city: "NYC" });
            expect(pred({ city: "NYC" })).toBe(true);
            expect(pred({ city: "LA" })).toBe(false);
            expect(pred({})).toBe(false);
        });

        it("supports field equality with number", () => {
            const pred = compileSelector({ age: 25 });
            expect(pred({ age: 25 })).toBe(true);
            expect(pred({ age: 30 })).toBe(false);
        });

        it("supports field equality with boolean", () => {
            const pred = compileSelector({ active: true });
            expect(pred({ active: true })).toBe(true);
            expect(pred({ active: false })).toBe(false);
        });

        it("supports field equality with null", () => {
            const pred = compileSelector({ deleted: null });
            expect(pred({ deleted: null })).toBe(true);
            expect(pred({ deleted: undefined })).toBe(false);
            expect(pred({ deleted: false })).toBe(false);
        });

        it("supports multiple field conditions (implicit $and)", () => {
            const pred = compileSelector({ city: "NYC", active: true });
            expect(pred({ city: "NYC", active: true })).toBe(true);
            expect(pred({ city: "NYC", active: false })).toBe(false);
            expect(pred({ city: "LA", active: true })).toBe(false);
        });
    });

    // ============================================
    // Nested field access (dot notation)
    // ============================================

    describe("nested field access (dot notation)", () => {
        it("supports dot notation for nested fields", () => {
            const pred = compileSelector({ "imdb.rating": 8 });
            expect(pred({ imdb: { rating: 8 } })).toBe(true);
            expect(pred({ imdb: { rating: 7 } })).toBe(false);
            expect(pred({ imdb: {} })).toBe(false);
            expect(pred({})).toBe(false);
        });

        it("supports deeply nested dot notation", () => {
            const pred = compileSelector({ "a.b.c.d": "value" });
            expect(pred({ a: { b: { c: { d: "value" } } } })).toBe(true);
            expect(pred({ a: { b: { c: { d: "other" } } } })).toBe(false);
        });

        it("supports dot notation with comparison operators", () => {
            const pred = compileSelector({ "stats.score": { $gte: 80 } });
            expect(pred({ stats: { score: 90 } })).toBe(true);
            expect(pred({ stats: { score: 80 } })).toBe(true);
            expect(pred({ stats: { score: 70 } })).toBe(false);
        });
    });

    // ============================================
    // Combination operators
    // ============================================

    describe("$or operator", () => {
        it("matches if any selector matches", () => {
            const pred = compileSelector({ $or: [{ city: "LA" }, { score: { $gte: 90 } }] });
            expect(pred({ city: "LA", score: 50 })).toBe(true);
            expect(pred({ city: "NYC", score: 95 })).toBe(true);
            expect(pred({ city: "NYC", score: 80 })).toBe(false);
        });

        it("throws for non-array value", () => {
            expect(() => compileSelector({ $or: "invalid" as any })).toThrow(
                "$or must be an array of query objects",
            );
        });
    });

    describe("$and operator", () => {
        it("matches if all selectors match", () => {
            const pred = compileSelector({ $and: [{ city: "SF" }, { score: { $gte: 90 } }] });
            expect(pred({ city: "SF", score: 95 })).toBe(true);
            expect(pred({ city: "SF", score: 80 })).toBe(false);
            expect(pred({ city: "LA", score: 95 })).toBe(false);
        });

        it("throws for non-array value", () => {
            expect(() => compileSelector({ $and: "invalid" as any })).toThrow(
                "$and must be an array of query objects",
            );
        });
    });

    describe("$not operator", () => {
        it("negates the selector", () => {
            const pred = compileSelector({ $not: { city: "NYC" } });
            expect(pred({ city: "LA" })).toBe(true);
            expect(pred({ city: "NYC" })).toBe(false);
        });

        it("works with comparison operators", () => {
            const pred = compileSelector({ $not: { score: { $lt: 50 } } });
            expect(pred({ score: 60 })).toBe(true);
            expect(pred({ score: 50 })).toBe(true);
            expect(pred({ score: 40 })).toBe(false);
        });

        it("throws for non-object value", () => {
            expect(() => compileSelector({ $not: "invalid" as any })).toThrow(
                "$not must be a selector object",
            );
        });
    });

    describe("$nor operator", () => {
        it("matches if none of the selectors match", () => {
            const pred = compileSelector({ $nor: [{ city: "NYC" }, { city: "LA" }] });
            expect(pred({ city: "SF" })).toBe(true);
            expect(pred({ city: "NYC" })).toBe(false);
            expect(pred({ city: "LA" })).toBe(false);
        });

        it("throws for non-array value", () => {
            expect(() => compileSelector({ $nor: "invalid" as any })).toThrow(
                "$nor must be an array of query objects",
            );
        });
    });

    // ============================================
    // Equality operators
    // ============================================

    describe("$eq operator", () => {
        it("matches equal values", () => {
            const pred = compileSelector({ city: { $eq: "NYC" } });
            expect(pred({ city: "NYC" })).toBe(true);
            expect(pred({ city: "LA" })).toBe(false);
        });

        it("works with numbers", () => {
            const pred = compileSelector({ score: { $eq: 100 } });
            expect(pred({ score: 100 })).toBe(true);
            expect(pred({ score: 99 })).toBe(false);
        });

        it("works with null", () => {
            const pred = compileSelector({ value: { $eq: null } });
            expect(pred({ value: null })).toBe(true);
            expect(pred({ value: undefined })).toBe(false);
        });
    });

    describe("$ne operator", () => {
        it("matches non-equal values", () => {
            const pred = compileSelector({ score: { $ne: 5 } });
            expect(pred({ score: 4 })).toBe(true);
            expect(pred({ score: 5 })).toBe(false);
            expect(pred({ score: "5" })).toBe(true);
        });
    });

    // ============================================
    // Comparison operators
    // ============================================

    describe("numeric comparisons ($gt/$lt/$gte/$lte)", () => {
        it("supports $gt", () => {
            const pred = compileSelector({ score: { $gt: 10 } });
            expect(pred({ score: 15 })).toBe(true);
            expect(pred({ score: 10 })).toBe(false);
            expect(pred({ score: 5 })).toBe(false);
        });

        it("supports $lt", () => {
            const pred = compileSelector({ score: { $lt: 10 } });
            expect(pred({ score: 5 })).toBe(true);
            expect(pred({ score: 10 })).toBe(false);
            expect(pred({ score: 15 })).toBe(false);
        });

        it("supports $gte", () => {
            const pred = compileSelector({ score: { $gte: 10 } });
            expect(pred({ score: 10 })).toBe(true);
            expect(pred({ score: 15 })).toBe(true);
            expect(pred({ score: 9 })).toBe(false);
        });

        it("supports $lte", () => {
            const pred = compileSelector({ score: { $lte: 10 } });
            expect(pred({ score: 10 })).toBe(true);
            expect(pred({ score: 5 })).toBe(true);
            expect(pred({ score: 11 })).toBe(false);
        });

        it("supports multiple comparators on one field", () => {
            const pred = compileSelector({ score: { $gte: 50, $lte: 70 } });
            expect(pred({ score: 50 })).toBe(true);
            expect(pred({ score: 70 })).toBe(true);
            expect(pred({ score: 60 })).toBe(true);
            expect(pred({ score: 40 })).toBe(false);
            expect(pred({ score: 80 })).toBe(false);
        });
    });

    describe("string comparisons with $gt/$lt/$gte/$lte", () => {
        it("compares strings lexicographically", () => {
            const pred = compileSelector({ name: { $gt: "Bob" } });
            expect(pred({ name: "Charlie" })).toBe(true);
            expect(pred({ name: "Alice" })).toBe(false);
        });
    });

    // ============================================
    // Array operators ($in, $nin, $all, $elemMatch, $allMatch, $size)
    // ============================================

    describe("$in operator", () => {
        it("matches if value is in array", () => {
            const pred = compileSelector({ status: { $in: ["draft", "published"] } });
            expect(pred({ status: "draft" })).toBe(true);
            expect(pred({ status: "published" })).toBe(true);
            expect(pred({ status: "archived" })).toBe(false);
        });

        it("treats non-array $in as falsey", () => {
            const pred = compileSelector({ score: { $in: 10 as any } });
            expect(pred({ score: 10 })).toBe(false);
        });
    });

    describe("$nin operator", () => {
        it("matches if value is not in array", () => {
            const pred = compileSelector({ status: { $nin: ["archived", "deleted"] } });
            expect(pred({ status: "active" })).toBe(true);
            expect(pred({ status: "archived" })).toBe(false);
            expect(pred({ status: "deleted" })).toBe(false);
        });

        it("treats non-array $nin as falsey", () => {
            const pred = compileSelector({ score: { $nin: 10 as any } });
            expect(pred({ score: 10 })).toBe(false);
        });
    });

    describe("$all operator", () => {
        it("matches if array contains all elements", () => {
            const pred = compileSelector({ tags: { $all: ["a", "b"] } });
            expect(pred({ tags: ["a", "b", "c"] })).toBe(true);
            expect(pred({ tags: ["a", "b"] })).toBe(true);
            expect(pred({ tags: ["a", "c"] })).toBe(false);
            expect(pred({ tags: ["a"] })).toBe(false);
        });

        it("returns false for non-array field", () => {
            const pred = compileSelector({ tags: { $all: ["a"] } });
            expect(pred({ tags: "a" })).toBe(false);
        });
    });

    describe("$elemMatch operator", () => {
        it("matches if any array element matches selector", () => {
            const pred = compileSelector({ items: { $elemMatch: { price: { $gt: 100 } } } });
            expect(pred({ items: [{ price: 50 }, { price: 150 }] })).toBe(true);
            expect(pred({ items: [{ price: 50 }, { price: 80 }] })).toBe(false);
        });

        it("works with simple equality", () => {
            const pred = compileSelector({ genre: { $elemMatch: { $eq: "Horror" } } });
            expect(pred({ genre: ["Comedy", "Horror"] })).toBe(true);
            expect(pred({ genre: ["Comedy", "Drama"] })).toBe(false);
        });

        it("returns false for non-array field", () => {
            const pred = compileSelector({ items: { $elemMatch: { $eq: "a" } } });
            expect(pred({ items: "a" })).toBe(false);
        });
    });

    describe("$allMatch operator", () => {
        it("matches if all array elements match selector", () => {
            const pred = compileSelector({ scores: { $allMatch: { $gte: 50 } } });
            expect(pred({ scores: [60, 70, 80] })).toBe(true);
            expect(pred({ scores: [40, 60, 70] })).toBe(false);
        });

        it("returns false for empty array", () => {
            const pred = compileSelector({ scores: { $allMatch: { $gte: 50 } } });
            expect(pred({ scores: [] })).toBe(false);
        });

        it("returns false for non-array field", () => {
            const pred = compileSelector({ scores: { $allMatch: { $gte: 50 } } });
            expect(pred({ scores: 60 })).toBe(false);
        });
    });

    describe("$size operator", () => {
        it("matches array with exact length", () => {
            const pred = compileSelector({ tags: { $size: 3 } });
            expect(pred({ tags: ["a", "b", "c"] })).toBe(true);
            expect(pred({ tags: ["a", "b"] })).toBe(false);
            expect(pred({ tags: ["a", "b", "c", "d"] })).toBe(false);
        });

        it("returns false for non-array field", () => {
            const pred = compileSelector({ tags: { $size: 1 } });
            expect(pred({ tags: "a" })).toBe(false);
        });

        it("returns false for non-number size", () => {
            const pred = compileSelector({ tags: { $size: "3" as any } });
            expect(pred({ tags: ["a", "b", "c"] })).toBe(false);
        });
    });

    // ============================================
    // Object/field operators ($exists, $type, $keyMapMatch)
    // ============================================

    describe("$exists operator", () => {
        it("matches when field exists", () => {
            const pred = compileSelector({ email: { $exists: true } });
            expect(pred({ email: "test@example.com" })).toBe(true);
            expect(pred({ email: null })).toBe(true);
            expect(pred({ name: "John" })).toBe(false);
        });

        it("matches when field does not exist", () => {
            const pred = compileSelector({ deleted: { $exists: false } });
            expect(pred({ name: "John" })).toBe(true);
            expect(pred({ deleted: null })).toBe(false);
            expect(pred({ deleted: true })).toBe(false);
        });

        it("works with nested fields", () => {
            const pred = compileSelector({ "user.email": { $exists: true } });
            expect(pred({ user: { email: "test@example.com" } })).toBe(true);
            expect(pred({ user: {} })).toBe(false);
            expect(pred({})).toBe(false);
        });
    });

    describe("$type operator", () => {
        it("matches null type", () => {
            const pred = compileSelector({ value: { $type: "null" } });
            expect(pred({ value: null })).toBe(true);
            expect(pred({ value: undefined })).toBe(false);
            expect(pred({ value: "" })).toBe(false);
        });

        it("matches boolean type", () => {
            const pred = compileSelector({ active: { $type: "boolean" } });
            expect(pred({ active: true })).toBe(true);
            expect(pred({ active: false })).toBe(true);
            expect(pred({ active: 1 })).toBe(false);
        });

        it("matches number type", () => {
            const pred = compileSelector({ count: { $type: "number" } });
            expect(pred({ count: 42 })).toBe(true);
            expect(pred({ count: 0 })).toBe(true);
            expect(pred({ count: "42" })).toBe(false);
        });

        it("matches string type", () => {
            const pred = compileSelector({ name: { $type: "string" } });
            expect(pred({ name: "John" })).toBe(true);
            expect(pred({ name: "" })).toBe(true);
            expect(pred({ name: 123 })).toBe(false);
        });

        it("matches array type", () => {
            const pred = compileSelector({ tags: { $type: "array" } });
            expect(pred({ tags: [] })).toBe(true);
            expect(pred({ tags: [1, 2, 3] })).toBe(true);
            expect(pred({ tags: {} })).toBe(false);
        });

        it("matches object type", () => {
            const pred = compileSelector({ meta: { $type: "object" } });
            expect(pred({ meta: {} })).toBe(true);
            expect(pred({ meta: { key: "value" } })).toBe(true);
            expect(pred({ meta: [] })).toBe(false);
            expect(pred({ meta: null })).toBe(false);
        });
    });

    describe("$keyMapMatch operator", () => {
        it("matches if map has key matching selector", () => {
            const pred = compileSelector({ cameras: { $keyMapMatch: { $eq: "secondary" } } });
            expect(pred({ cameras: { primary: {}, secondary: {} } })).toBe(true);
            expect(pred({ cameras: { primary: {} } })).toBe(false);
        });

        it("returns false for non-object field", () => {
            const pred = compileSelector({ cameras: { $keyMapMatch: { $eq: "a" } } });
            expect(pred({ cameras: ["a"] })).toBe(false);
            expect(pred({ cameras: null })).toBe(false);
        });
    });

    // ============================================
    // String/pattern operators ($regex, $beginsWith)
    // ============================================

    describe("$regex operator", () => {
        it("matches string with regex pattern", () => {
            const pred = compileSelector({ title: { $regex: "^The" } });
            expect(pred({ title: "The Matrix" })).toBe(true);
            expect(pred({ title: "Matrix" })).toBe(false);
        });

        it("supports case-insensitive patterns", () => {
            const pred = compileSelector({ title: { $regex: "matrix" } });
            expect(pred({ title: "The Matrix" })).toBe(false); // case sensitive by default
            const pred2 = compileSelector({ title: { $regex: "[Mm]atrix" } });
            expect(pred2({ title: "The Matrix" })).toBe(true);
        });

        it("returns false for non-string field", () => {
            const pred = compileSelector({ count: { $regex: "\\d+" } });
            expect(pred({ count: 123 })).toBe(false);
        });

        it("returns false for invalid regex", () => {
            const pred = compileSelector({ title: { $regex: "[invalid" } });
            expect(pred({ title: "anything" })).toBe(false);
        });
    });

    describe("$beginsWith operator", () => {
        it("matches string with prefix", () => {
            const pred = compileSelector({ name: { $beginsWith: "John" } });
            expect(pred({ name: "John Doe" })).toBe(true);
            expect(pred({ name: "Johnny" })).toBe(true);
            expect(pred({ name: "Jane" })).toBe(false);
        });

        it("is case sensitive", () => {
            const pred = compileSelector({ name: { $beginsWith: "john" } });
            expect(pred({ name: "John" })).toBe(false);
        });

        it("returns false for non-string field", () => {
            const pred = compileSelector({ count: { $beginsWith: "1" } });
            expect(pred({ count: 123 })).toBe(false);
        });
    });

    // ============================================
    // Numeric operator ($mod)
    // ============================================

    describe("$mod operator", () => {
        it("matches when field mod divisor equals remainder", () => {
            const pred = compileSelector({ value: { $mod: [10, 1] } });
            expect(pred({ value: 11 })).toBe(true);
            expect(pred({ value: 21 })).toBe(true);
            expect(pred({ value: 10 })).toBe(false);
        });

        it("returns false for non-integer field", () => {
            const pred = compileSelector({ value: { $mod: [10, 1] } });
            expect(pred({ value: 11.5 })).toBe(false);
            expect(pred({ value: "11" })).toBe(false);
        });

        it("returns false for invalid $mod argument", () => {
            const pred = compileSelector({ value: { $mod: [0, 1] } }); // divisor is 0
            expect(pred({ value: 1 })).toBe(false);

            const pred2 = compileSelector({ value: { $mod: [10] as any } }); // missing remainder
            expect(pred2({ value: 10 })).toBe(false);

            const pred3 = compileSelector({ value: { $mod: "invalid" as any } });
            expect(pred3({ value: 10 })).toBe(false);
        });
    });

    // ============================================
    // Complex queries
    // ============================================

    describe("complex queries", () => {
        it("handles nested $and and $or", () => {
            const pred = compileSelector({
                $and: [
                    { type: "movie" },
                    {
                        $or: [{ "imdb.rating": { $gte: 8 } }, { year: { $gte: 2020 } }],
                    },
                ],
            });
            expect(pred({ type: "movie", imdb: { rating: 9 }, year: 2015 })).toBe(true);
            expect(pred({ type: "movie", imdb: { rating: 7 }, year: 2022 })).toBe(true);
            expect(pred({ type: "movie", imdb: { rating: 7 }, year: 2015 })).toBe(false);
            expect(pred({ type: "show", imdb: { rating: 9 }, year: 2015 })).toBe(false);
        });

        it("handles $not within $and", () => {
            const pred = compileSelector({
                $and: [{ status: "active" }, { $not: { role: "guest" } }],
            });
            expect(pred({ status: "active", role: "admin" })).toBe(true);
            expect(pred({ status: "active", role: "guest" })).toBe(false);
            expect(pred({ status: "inactive", role: "admin" })).toBe(false);
        });

        it("supports CouchDB-style partial index query", () => {
            const pred = compileSelector({
                year: { $gte: 1900, $lte: 1903 },
                $not: { year: 1901 },
            });
            expect(pred({ year: 1900 })).toBe(true);
            expect(pred({ year: 1902 })).toBe(true);
            expect(pred({ year: 1903 })).toBe(true);
            expect(pred({ year: 1901 })).toBe(false);
            expect(pred({ year: 1899 })).toBe(false);
        });
    });

    // ============================================
    // Edge cases
    // ============================================

    describe("edge cases", () => {
        it("handles undefined document values gracefully", () => {
            const pred = compileSelector({ city: "NYC" });
            expect(pred(null)).toBe(false);
            expect(pred(undefined)).toBe(false);
        });

        it("handles nested object equality (implicit subfield)", () => {
            const pred = compileSelector({ imdb: { rating: 8 } });
            expect(pred({ imdb: { rating: 8 } })).toBe(true);
            expect(pred({ imdb: { rating: 9 } })).toBe(false);
        });

        it("unknown operators return false", () => {
            const pred = compileSelector({ field: { $unknown: "value" } as any });
            expect(pred({ field: "value" })).toBe(false);
        });
    });
});
