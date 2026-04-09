import { describe, it, expect } from "vitest";
import { compileTemplateSelector } from "./compileTemplateSelector";
import { normalizeSelector } from "./templateNormalize";

/**
 * Helper: normalize a selector and compile its template, returning a function
 * that takes a doc and evaluates the predicate with the extracted values.
 */
function compile(selector: Record<string, any>) {
    const { template, values } = normalizeSelector(selector);
    const pred = compileTemplateSelector(template);
    return (doc: any) => pred(doc, values);
}

describe("compileTemplateSelector", () => {
    describe("edge cases", () => {
        it("returns false for null template", () => {
            const pred = compileTemplateSelector(null as any);
            expect(pred({}, [])).toBe(false);
        });

        it("returns false for non-object template", () => {
            const pred = compileTemplateSelector("invalid" as any);
            expect(pred({}, [])).toBe(false);
        });

        it("returns true for empty template", () => {
            const pred = compileTemplateSelector({});
            expect(pred({}, [])).toBe(true);
        });
    });

    describe("field matching", () => {
        it("matches placeholder field value", () => {
            const match = compile({ type: "post" });
            expect(match({ type: "post" })).toBe(true);
            expect(match({ type: "tag" })).toBe(false);
        });

        it("matches static boolean field", () => {
            const match = compile({ active: true });
            expect(match({ active: true })).toBe(true);
            expect(match({ active: false })).toBe(false);
        });

        it("matches static null field", () => {
            // Booleans are kept static, null is extracted as placeholder
            const match = compile({ field: null });
            expect(match({ field: null })).toBe(true);
            expect(match({ field: "something" })).toBe(false);
        });

        it("matches nested object equality using $eq operator", () => {
            // To get deep equality for objects, use $eq operator
            const match = compile({ meta: { $eq: { a: 1, b: 2 } } });
            expect(match({ meta: { a: 1, b: 2 } })).toBe(true);
            expect(match({ meta: { a: 1, b: 3 } })).toBe(false);
        });

        it("handles static nested object equality in template", () => {
            // Directly build a template with a static nested object (no placeholder)
            const template = { meta: { nested: "static-val" } };
            // "nested" is not a $ operator, so compileTemplateSelector treats it as nested object equality
            const pred = compileTemplateSelector(template as any);
            expect(pred({ meta: { nested: "static-val" } }, [])).toBe(true);
            expect(pred({ meta: { nested: "other" } }, [])).toBe(false);
        });

        it("handles dot-notation field access", () => {
            const { template, values } = normalizeSelector({ "a.b.c": "deep" });
            const pred = compileTemplateSelector(template);
            expect(pred({ a: { b: { c: "deep" } } }, values)).toBe(true);
            expect(pred({ a: { b: { c: "other" } } }, values)).toBe(false);
        });

        it("handles null doc for field access", () => {
            const { template, values } = normalizeSelector({ field: "val" });
            const pred = compileTemplateSelector(template);
            expect(pred(null, values)).toBe(false);
            expect(pred(undefined, values)).toBe(false);
        });
    });

    describe("$or operator", () => {
        it("matches when any sub-selector matches", () => {
            const match = compile({ $or: [{ type: "post" }, { type: "tag" }] });
            expect(match({ type: "post" })).toBe(true);
            expect(match({ type: "tag" })).toBe(true);
            expect(match({ type: "other" })).toBe(false);
        });

        it("returns false when none match", () => {
            const match = compile({ $or: [{ type: "post" }] });
            expect(match({ type: "tag" })).toBe(false);
        });

        it("throws on non-array", () => {
            expect(() => compileTemplateSelector({ $or: "invalid" as any })).toThrow(
                "$or must be an array",
            );
        });
    });

    describe("$and operator", () => {
        it("matches when all sub-selectors match", () => {
            const match = compile({ $and: [{ type: "post" }, { active: true }] });
            expect(match({ type: "post", active: true })).toBe(true);
            expect(match({ type: "post", active: false })).toBe(false);
        });

        it("throws on non-array", () => {
            expect(() => compileTemplateSelector({ $and: "invalid" as any })).toThrow(
                "$and must be an array",
            );
        });
    });

    describe("$not operator", () => {
        it("inverts the sub-selector", () => {
            const match = compile({ $not: { type: "post" } });
            expect(match({ type: "post" })).toBe(false);
            expect(match({ type: "tag" })).toBe(true);
        });

        it("throws on non-object", () => {
            expect(() => compileTemplateSelector({ $not: "invalid" as any })).toThrow(
                "$not must be a selector object",
            );
        });

        it("throws on array", () => {
            expect(() => compileTemplateSelector({ $not: [{ type: "post" }] as any })).toThrow(
                "$not must be a selector object",
            );
        });

        it("throws on null", () => {
            expect(() => compileTemplateSelector({ $not: null as any })).toThrow(
                "$not must be a selector object",
            );
        });
    });

    describe("$nor operator", () => {
        it("matches when no sub-selectors match", () => {
            const match = compile({ $nor: [{ type: "post" }, { type: "tag" }] });
            expect(match({ type: "other" })).toBe(true);
            expect(match({ type: "post" })).toBe(false);
            expect(match({ type: "tag" })).toBe(false);
        });

        it("throws on non-array", () => {
            expect(() => compileTemplateSelector({ $nor: "invalid" as any })).toThrow(
                "$nor must be an array",
            );
        });
    });

    describe("$eq operator", () => {
        it("matches equal primitive values", () => {
            const match = compile({ count: { $eq: 5 } });
            expect(match({ count: 5 })).toBe(true);
            expect(match({ count: 6 })).toBe(false);
        });

        it("matches equal object values", () => {
            const match = compile({ meta: { $eq: { a: 1 } } });
            expect(match({ meta: { a: 1 } })).toBe(true);
            expect(match({ meta: { a: 2 } })).toBe(false);
        });

        it("matches null with $eq", () => {
            const match = compile({ field: { $eq: null } });
            expect(match({ field: null })).toBe(true);
            expect(match({ field: "something" })).toBe(false);
        });
    });

    describe("$ne operator", () => {
        it("matches non-equal values", () => {
            const match = compile({ count: { $ne: 5 } });
            expect(match({ count: 6 })).toBe(true);
            expect(match({ count: 5 })).toBe(false);
        });

        it("handles object comparison", () => {
            const match = compile({ meta: { $ne: { a: 1 } } });
            expect(match({ meta: { a: 2 } })).toBe(true);
            expect(match({ meta: { a: 1 } })).toBe(false);
        });
    });

    describe("$gt operator", () => {
        it("matches greater values", () => {
            const match = compile({ count: { $gt: 5 } });
            expect(match({ count: 6 })).toBe(true);
            expect(match({ count: 5 })).toBe(false);
            expect(match({ count: 4 })).toBe(false);
        });

        it("handles non-number comparison", () => {
            const match = compile({ name: { $gt: "b" } });
            expect(match({ name: "c" })).toBe(true);
            expect(match({ name: "a" })).toBe(false);
        });

        it("returns false when doc value is not a number and query is number", () => {
            const match = compile({ count: { $gt: 5 } });
            expect(match({ count: "hello" })).toBe(false);
        });
    });

    describe("$lt operator", () => {
        it("matches lesser values", () => {
            const match = compile({ count: { $lt: 5 } });
            expect(match({ count: 4 })).toBe(true);
            expect(match({ count: 5 })).toBe(false);
            expect(match({ count: 6 })).toBe(false);
        });

        it("returns false when doc value is not a number and query is number", () => {
            const match = compile({ count: { $lt: 5 } });
            expect(match({ count: "hello" })).toBe(false);
        });
    });

    describe("$gte operator", () => {
        it("matches greater or equal values", () => {
            const match = compile({ count: { $gte: 5 } });
            expect(match({ count: 5 })).toBe(true);
            expect(match({ count: 6 })).toBe(true);
            expect(match({ count: 4 })).toBe(false);
        });

        it("returns false when doc value is not a number and query is number", () => {
            const match = compile({ count: { $gte: 5 } });
            expect(match({ count: "hello" })).toBe(false);
        });
    });

    describe("$lte operator", () => {
        it("matches lesser or equal values", () => {
            const match = compile({ count: { $lte: 5 } });
            expect(match({ count: 5 })).toBe(true);
            expect(match({ count: 4 })).toBe(true);
            expect(match({ count: 6 })).toBe(false);
        });

        it("returns false when doc value is not a number and query is number", () => {
            const match = compile({ count: { $lte: 5 } });
            expect(match({ count: "hello" })).toBe(false);
        });
    });

    describe("$in operator", () => {
        it("matches when value is in array", () => {
            const match = compile({ type: { $in: ["post", "tag"] } });
            expect(match({ type: "post" })).toBe(true);
            expect(match({ type: "tag" })).toBe(true);
            expect(match({ type: "other" })).toBe(false);
        });

        it("returns false when value is not an array", () => {
            const { template, values } = normalizeSelector({ type: { $in: "not-array" as any } });
            const pred = compileTemplateSelector(template);
            // The value "not-array" is stored in values, but $in checks Array.isArray
            expect(pred({ type: "not-array" }, values)).toBe(false);
        });

        it("handles object comparison in $in", () => {
            const match = compile({ meta: { $in: [{ a: 1 }, { a: 2 }] } });
            expect(match({ meta: { a: 1 } })).toBe(true);
            expect(match({ meta: { a: 3 } })).toBe(false);
        });
    });

    describe("$nin operator", () => {
        it("matches when value is not in array", () => {
            const match = compile({ type: { $nin: ["post", "tag"] } });
            expect(match({ type: "other" })).toBe(true);
            expect(match({ type: "post" })).toBe(false);
        });

        it("returns false when value is not an array", () => {
            const { template, values } = normalizeSelector({ type: { $nin: "not-array" as any } });
            const pred = compileTemplateSelector(template);
            expect(pred({ type: "test" }, values)).toBe(false);
        });

        it("handles object comparison in $nin", () => {
            const match = compile({ meta: { $nin: [{ a: 1 }] } });
            expect(match({ meta: { a: 1 } })).toBe(false);
            expect(match({ meta: { a: 2 } })).toBe(true);
        });
    });

    describe("$exists operator", () => {
        it("matches existing field when true", () => {
            const match = compile({ name: { $exists: true } });
            expect(match({ name: "test" })).toBe(true);
            expect(match({})).toBe(false);
        });

        it("matches non-existing field when false", () => {
            const match = compile({ name: { $exists: false } });
            expect(match({})).toBe(true);
            expect(match({ name: "test" })).toBe(false);
        });

        it("returns false for non-boolean value", () => {
            const { template, values } = normalizeSelector({
                name: { $exists: "yes" as any },
            });
            const pred = compileTemplateSelector(template);
            expect(pred({ name: "test" }, values)).toBe(false);
        });

        it("treats undefined field values as non-existing", () => {
            const match = compile({ name: { $exists: true } });
            expect(match({ name: undefined })).toBe(false);
        });

        it("handles dot-notation in $exists", () => {
            const match = compile({ "a.b": { $exists: true } });
            expect(match({ a: { b: "value" } })).toBe(true);
            expect(match({ a: {} })).toBe(false);
            expect(match({ a: null })).toBe(false);
        });
    });

    describe("$type operator", () => {
        it("matches type of field value", () => {
            const match = compile({ field: { $type: "string" } });
            expect(match({ field: "hello" })).toBe(true);
            expect(match({ field: 42 })).toBe(false);
        });

        it("matches null type", () => {
            const match = compile({ field: { $type: "null" } });
            expect(match({ field: null })).toBe(true);
            expect(match({ field: "hello" })).toBe(false);
        });

        it("matches array type", () => {
            const match = compile({ field: { $type: "array" } });
            expect(match({ field: [1, 2] })).toBe(true);
            expect(match({ field: "hello" })).toBe(false);
        });
    });

    describe("$size operator", () => {
        it("matches array of specified size", () => {
            const match = compile({ tags: { $size: 3 } });
            expect(match({ tags: [1, 2, 3] })).toBe(true);
            expect(match({ tags: [1, 2] })).toBe(false);
        });

        it("returns false for non-array field", () => {
            const match = compile({ tags: { $size: 1 } });
            expect(match({ tags: "not-array" })).toBe(false);
        });

        it("returns false for non-number size", () => {
            const { template, values } = normalizeSelector({
                tags: { $size: "3" as any },
            });
            const pred = compileTemplateSelector(template);
            expect(pred({ tags: [1, 2, 3] }, values)).toBe(false);
        });
    });

    describe("$mod operator", () => {
        it("matches modulo operation", () => {
            const match = compile({ count: { $mod: [3, 0] } });
            expect(match({ count: 9 })).toBe(true);
            expect(match({ count: 10 })).toBe(false);
        });

        it("returns false for invalid mod value", () => {
            const { template, values } = normalizeSelector({
                count: { $mod: [0, 0] },
            });
            const pred = compileTemplateSelector(template);
            // Divisor 0 is invalid
            expect(pred({ count: 0 }, values)).toBe(false);
        });

        it("returns false for non-integer mod values", () => {
            const { template, values } = normalizeSelector({
                count: { $mod: [2.5, 1] },
            });
            const pred = compileTemplateSelector(template);
            expect(pred({ count: 3 }, values)).toBe(false);
        });

        it("returns false for non-array mod value", () => {
            const { template, values } = normalizeSelector({
                count: { $mod: "invalid" as any },
            });
            const pred = compileTemplateSelector(template);
            expect(pred({ count: 3 }, values)).toBe(false);
        });

        it("returns false for non-integer doc value", () => {
            const match = compile({ count: { $mod: [3, 0] } });
            expect(match({ count: 3.5 })).toBe(false);
        });

        it("returns false for non-number doc value", () => {
            const match = compile({ count: { $mod: [3, 0] } });
            expect(match({ count: "3" })).toBe(false);
        });

        it("returns false for wrong length mod array", () => {
            const { template, values } = normalizeSelector({
                count: { $mod: [3] as any },
            });
            const pred = compileTemplateSelector(template);
            expect(pred({ count: 3 }, values)).toBe(false);
        });
    });

    describe("$regex operator", () => {
        it("matches regex pattern", () => {
            const match = compile({ name: { $regex: "^test" } });
            expect(match({ name: "test-doc" })).toBe(true);
            expect(match({ name: "other" })).toBe(false);
        });

        it("returns false for non-string field value", () => {
            const match = compile({ name: { $regex: "^test" } });
            expect(match({ name: 42 })).toBe(false);
        });

        it("returns false for non-string pattern", () => {
            const { template, values } = normalizeSelector({
                name: { $regex: 42 as any },
            });
            const pred = compileTemplateSelector(template);
            expect(pred({ name: "test" }, values)).toBe(false);
        });

        it("returns false for invalid regex pattern", () => {
            const match = compile({ name: { $regex: "[invalid" } });
            expect(match({ name: "test" })).toBe(false);
        });
    });

    describe("$beginsWith operator", () => {
        it("matches string prefix", () => {
            const match = compile({ name: { $beginsWith: "pre" } });
            expect(match({ name: "prefix-value" })).toBe(true);
            expect(match({ name: "other" })).toBe(false);
        });

        it("returns false for non-string field value", () => {
            const match = compile({ name: { $beginsWith: "pre" } });
            expect(match({ name: 42 })).toBe(false);
        });

        it("returns false for non-string prefix", () => {
            const { template, values } = normalizeSelector({
                name: { $beginsWith: 42 as any },
            });
            const pred = compileTemplateSelector(template);
            expect(pred({ name: "test" }, values)).toBe(false);
        });
    });

    describe("$all operator", () => {
        it("matches when all required values are in array", () => {
            const match = compile({ tags: { $all: ["a", "b"] } });
            expect(match({ tags: ["a", "b", "c"] })).toBe(true);
            expect(match({ tags: ["a", "c"] })).toBe(false);
        });

        it("returns false for non-array field value", () => {
            const match = compile({ tags: { $all: ["a"] } });
            expect(match({ tags: "not-array" })).toBe(false);
        });

        it("returns false for non-array required value", () => {
            const { template, values } = normalizeSelector({
                tags: { $all: "not-array" as any },
            });
            const pred = compileTemplateSelector(template);
            expect(pred({ tags: ["a"] }, values)).toBe(false);
        });
    });

    describe("$elemMatch operator", () => {
        it("matches when any array element matches selector", () => {
            const match = compile({
                items: { $elemMatch: { status: "active" } },
            });
            expect(match({ items: [{ status: "active" }, { status: "inactive" }] })).toBe(true);
            expect(match({ items: [{ status: "inactive" }] })).toBe(false);
        });

        it("returns false for non-array field", () => {
            const match = compile({
                items: { $elemMatch: { status: "active" } },
            });
            expect(match({ items: "not-array" })).toBe(false);
        });
    });

    describe("$allMatch operator", () => {
        it("matches when all array elements match selector", () => {
            const match = compile({
                items: { $allMatch: { status: "active" } },
            });
            expect(match({ items: [{ status: "active" }, { status: "active" }] })).toBe(true);
            expect(match({ items: [{ status: "active" }, { status: "inactive" }] })).toBe(false);
        });

        it("returns false for empty array", () => {
            const match = compile({
                items: { $allMatch: { status: "active" } },
            });
            expect(match({ items: [] })).toBe(false);
        });

        it("returns false for non-array field", () => {
            const match = compile({
                items: { $allMatch: { status: "active" } },
            });
            expect(match({ items: "not-array" })).toBe(false);
        });
    });

    describe("$keyMapMatch operator", () => {
        it("matches when any key matches selector", () => {
            const match = compile({
                data: { $keyMapMatch: { $beginsWith: "pre" } },
            });
            expect(match({ data: { prefix_key: 1, other: 2 } })).toBe(true);
            expect(match({ data: { other: 1, another: 2 } })).toBe(false);
        });

        it("returns false for non-object field", () => {
            const match = compile({
                data: { $keyMapMatch: { $eq: "key" } },
            });
            expect(match({ data: "not-object" })).toBe(false);
            expect(match({ data: null })).toBe(false);
            expect(match({ data: [1, 2] })).toBe(false);
        });
    });

    describe("multiple predicates", () => {
        it("combines multiple field criteria with AND", () => {
            const match = compile({ type: "post", status: "published", active: true });
            expect(match({ type: "post", status: "published", active: true })).toBe(true);
            expect(match({ type: "post", status: "draft", active: true })).toBe(false);
        });

        it("combines multiple operators on same field", () => {
            const match = compile({ count: { $gte: 5, $lt: 10 } });
            expect(match({ count: 7 })).toBe(true);
            expect(match({ count: 3 })).toBe(false);
            expect(match({ count: 10 })).toBe(false);
        });
    });

    describe("comparison utilities (tested through operators)", () => {
        it("compares across different types", () => {
            // null < undefined < boolean < number < string < array < object
            const match = compile({ field: { $gt: null } });
            expect(match({ field: undefined })).toBe(true);
            expect(match({ field: 42 })).toBe(true);
        });

        it("compares boolean values", () => {
            const match = compile({ field: { $gt: false } });
            expect(match({ field: true })).toBe(true);
        });

        it("compares arrays", () => {
            const match = compile({ field: { $eq: [1, 2, 3] } });
            expect(match({ field: [1, 2, 3] })).toBe(true);
            expect(match({ field: [1, 2, 4] })).toBe(false);
            expect(match({ field: [1, 2] })).toBe(false);
        });

        it("compares objects", () => {
            const match = compile({ field: { $eq: { a: 1, b: 2 } } });
            expect(match({ field: { a: 1, b: 2 } })).toBe(true);
            expect(match({ field: { a: 1, b: 3 } })).toBe(false);
            expect(match({ field: { a: 1 } })).toBe(false);
        });
    });

    describe("compilePrimitiveMatcher paths", () => {
        it("handles all-condition operators in $elemMatch", () => {
            const match = compile({
                items: { $elemMatch: { $gt: 5 } },
            });
            expect(match({ items: [1, 2, 6] })).toBe(true);
            expect(match({ items: [1, 2, 3] })).toBe(false);
        });

        it("handles mixed operators in $elemMatch (falls to compileFunc)", () => {
            const match = compile({
                items: { $elemMatch: { name: "test", value: { $gt: 5 } } },
            });
            expect(match({ items: [{ name: "test", value: 10 }] })).toBe(true);
            expect(match({ items: [{ name: "other", value: 10 }] })).toBe(false);
        });

        it("handles $eq in primitive matcher", () => {
            const match = compile({
                items: { $elemMatch: { $eq: "target" } },
            });
            expect(match({ items: ["target", "other"] })).toBe(true);
            expect(match({ items: ["other"] })).toBe(false);
        });

        it("handles $ne in primitive matcher", () => {
            const match = compile({
                items: { $elemMatch: { $ne: "excluded" } },
            });
            expect(match({ items: ["other"] })).toBe(true);
        });

        it("handles $in in primitive matcher", () => {
            const match = compile({
                items: { $elemMatch: { $in: ["a", "b"] } },
            });
            expect(match({ items: ["a", "c"] })).toBe(true);
            expect(match({ items: ["c", "d"] })).toBe(false);
        });

        it("handles $nin in primitive matcher", () => {
            const match = compile({
                items: { $elemMatch: { $nin: ["a", "b"] } },
            });
            expect(match({ items: ["c"] })).toBe(true);
        });

        it("handles $type in primitive matcher", () => {
            const match = compile({
                items: { $elemMatch: { $type: "number" } },
            });
            expect(match({ items: ["str", 42] })).toBe(true);
            expect(match({ items: ["str", "str2"] })).toBe(false);
        });

        it("handles $regex in primitive matcher", () => {
            const match = compile({
                items: { $elemMatch: { $regex: "^test" } },
            });
            expect(match({ items: ["test-1", "other"] })).toBe(true);
            expect(match({ items: ["other"] })).toBe(false);
        });

        it("handles $beginsWith in primitive matcher", () => {
            const match = compile({
                items: { $elemMatch: { $beginsWith: "pre" } },
            });
            expect(match({ items: ["prefix", "other"] })).toBe(true);
            expect(match({ items: ["other"] })).toBe(false);
        });

        it("handles $mod in primitive matcher", () => {
            const match = compile({
                items: { $elemMatch: { $mod: [3, 0] } },
            });
            expect(match({ items: [1, 9] })).toBe(true);
            expect(match({ items: [1, 2] })).toBe(false);
        });

        it("handles $gt/$lt/$gte/$lte in primitive matcher", () => {
            const matchGt = compile({ items: { $elemMatch: { $gt: 5 } } });
            expect(matchGt({ items: [1, 6] })).toBe(true);

            const matchLt = compile({ items: { $elemMatch: { $lt: 5 } } });
            expect(matchLt({ items: [4, 10] })).toBe(true);

            const matchGte = compile({ items: { $elemMatch: { $gte: 5 } } });
            expect(matchGte({ items: [5] })).toBe(true);

            const matchLte = compile({ items: { $elemMatch: { $lte: 5 } } });
            expect(matchLte({ items: [5] })).toBe(true);
        });

        it("handles $exists in primitive matcher", () => {
            // $exists on primitive context doesn't make much sense but tests the branch
            const match = compile({
                items: { $elemMatch: { $exists: true } },
            });
            // In primitive matcher, $exists checks typeof shouldExist === 'boolean'
            // The elem check uses createFieldExistsChecker which won't apply to primitives
            // The predicate returns false for non-boolean
            expect(match({ items: [1] })).toBe(false);
        });

        it("handles non-array $in in primitive matcher returns false", () => {
            const { template, values } = normalizeSelector({
                items: { $elemMatch: { $in: "not-array" as any } },
            });
            const pred = compileTemplateSelector(template);
            expect(pred({ items: ["test"] }, values)).toBe(false);
        });

        it("handles non-array $nin in primitive matcher returns false", () => {
            const { template, values } = normalizeSelector({
                items: { $elemMatch: { $nin: "not-array" as any } },
            });
            const pred = compileTemplateSelector(template);
            expect(pred({ items: ["test"] }, values)).toBe(false);
        });

        it("handles non-string $regex in primitive matcher returns false", () => {
            const { template, values } = normalizeSelector({
                items: { $elemMatch: { $regex: 42 as any } },
            });
            const pred = compileTemplateSelector(template);
            expect(pred({ items: ["test"] }, values)).toBe(false);
        });

        it("handles invalid $regex in primitive matcher returns false", () => {
            const match = compile({
                items: { $elemMatch: { $regex: "[invalid" } },
            });
            expect(match({ items: ["test"] })).toBe(false);
        });

        it("handles non-string $beginsWith in primitive matcher returns false", () => {
            const { template, values } = normalizeSelector({
                items: { $elemMatch: { $beginsWith: 42 as any } },
            });
            const pred = compileTemplateSelector(template);
            expect(pred({ items: ["test"] }, values)).toBe(false);
        });

        it("handles non-number in $beginsWith primitive context", () => {
            const match = compile({
                items: { $elemMatch: { $beginsWith: "pre" } },
            });
            expect(match({ items: [42] })).toBe(false);
        });

        it("handles invalid $mod in primitive matcher", () => {
            const { template, values } = normalizeSelector({
                items: { $elemMatch: { $mod: [0, 0] } },
            });
            const pred = compileTemplateSelector(template);
            expect(pred({ items: [3] }, values)).toBe(false);
        });

        it("handles non-integer in $mod primitive matcher", () => {
            const match = compile({
                items: { $elemMatch: { $mod: [3, 0] } },
            });
            expect(match({ items: [3.5] })).toBe(false);
            expect(match({ items: ["hello"] })).toBe(false);
        });

        it("handles multiple conditions in primitive matcher", () => {
            const match = compile({
                items: { $elemMatch: { $gte: 5, $lt: 10 } },
            });
            expect(match({ items: [1, 7] })).toBe(true);
            expect(match({ items: [1, 2] })).toBe(false);
        });
    });

    describe("null $elemMatch selector", () => {
        it("returns false for null elemMatch selector", () => {
            // Directly construct a template with null $elemMatch
            const template = { items: { $elemMatch: null } };
            const pred = compileTemplateSelector(template as any);
            expect(pred({ items: [1, 2] }, [])).toBe(false);
        });
    });

    describe("static value branches in field criteria", () => {
        it("handles static $eq value", () => {
            // Directly construct template with static boolean (kept by normalizer)
            const template = { active: true };
            const pred = compileTemplateSelector(template);
            expect(pred({ active: true }, [])).toBe(true);
            expect(pred({ active: false }, [])).toBe(false);
        });
    });
});
