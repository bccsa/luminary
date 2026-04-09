import { describe, it, expect } from "vitest";
import {
    isPlaceholder,
    normalizeSelector,
    generateTemplateKey,
} from "./templateNormalize";

describe("isPlaceholder", () => {
    it("returns true for valid placeholder object", () => {
        expect(isPlaceholder({ $__idx: 0 })).toBe(true);
        expect(isPlaceholder({ $__idx: 5 })).toBe(true);
    });

    it("returns false for null", () => {
        expect(isPlaceholder(null)).toBe(false);
    });

    it("returns false for undefined", () => {
        expect(isPlaceholder(undefined)).toBe(false);
    });

    it("returns false for arrays", () => {
        expect(isPlaceholder([1, 2])).toBe(false);
    });

    it("returns false for strings", () => {
        expect(isPlaceholder("test")).toBe(false);
    });

    it("returns false for numbers", () => {
        expect(isPlaceholder(42)).toBe(false);
    });

    it("returns false for booleans", () => {
        expect(isPlaceholder(true)).toBe(false);
    });

    it("returns false for objects without $__idx", () => {
        expect(isPlaceholder({ foo: 1 })).toBe(false);
    });

    it("returns false when $__idx is not a number", () => {
        expect(isPlaceholder({ $__idx: "notanumber" })).toBe(false);
    });
});

describe("normalizeSelector", () => {
    it("extracts primitive field values as placeholders", () => {
        const result = normalizeSelector({ type: "post" });
        expect(result.values).toEqual(["post"]);
        expect(isPlaceholder((result.template as any).type)).toBe(true);
        expect((result.template as any).type.$__idx).toBe(0);
    });

    it("extracts multiple fields in order", () => {
        const result = normalizeSelector({ type: "post", status: "published" });
        expect(result.values).toEqual(["post", "published"]);
        expect((result.template as any).type.$__idx).toBe(0);
        expect((result.template as any).status.$__idx).toBe(1);
    });

    it("keeps boolean values static", () => {
        const result = normalizeSelector({ active: true });
        expect(result.values).toEqual([]);
        expect((result.template as any).active).toBe(true);
    });

    it("extracts null primitive values", () => {
        const result = normalizeSelector({ field: null as any });
        expect(result.values).toEqual([null]);
        expect(isPlaceholder((result.template as any).field)).toBe(true);
    });

    it("extracts array field values", () => {
        const result = normalizeSelector({ tags: [1, 2, 3] as any });
        expect(result.values).toEqual([[1, 2, 3]]);
        expect(isPlaceholder((result.template as any).tags)).toBe(true);
    });

    it("handles $and combination operator", () => {
        const result = normalizeSelector({
            $and: [{ type: "post" }, { status: "published" }],
        });
        expect(result.values).toEqual(["post", "published"]);
        expect((result.template as any).$and).toHaveLength(2);
    });

    it("handles $or combination operator", () => {
        const result = normalizeSelector({
            $or: [{ type: "post" }, { type: "tag" }],
        });
        expect(result.values).toEqual(["post", "tag"]);
    });

    it("handles $not combination operator", () => {
        const result = normalizeSelector({
            $not: { type: "post" },
        });
        expect(result.values).toEqual(["post"]);
        expect((result.template as any).$not).toBeDefined();
    });

    it("handles $nor combination operator", () => {
        const result = normalizeSelector({
            $nor: [{ type: "post" }],
        });
        expect(result.values).toEqual(["post"]);
    });

    it("keeps non-array value for combination operators as-is", () => {
        const result = normalizeSelector({
            $and: "invalid" as any,
        });
        expect((result.template as any).$and).toBe("invalid");
    });

    it("extracts value operator values ($eq, $gt, etc.)", () => {
        const result = normalizeSelector({
            count: { $gte: 5, $lt: 10 },
        });
        expect(result.values).toEqual([5, 10]);
    });

    it("recurses into selector operators ($elemMatch)", () => {
        const result = normalizeSelector({
            tags: { $elemMatch: { name: "test" } },
        });
        expect(result.values).toEqual(["test"]);
    });

    it("keeps non-object values for selector operators as-is", () => {
        const result = normalizeSelector({
            tags: { $elemMatch: null as any },
        });
        expect((result.template as any).tags.$elemMatch).toBeNull();
    });

    it("keeps unknown operators as-is", () => {
        const result = normalizeSelector({
            field: { $customOp: "value" } as any,
        });
        expect((result.template as any).field.$customOp).toBe("value");
    });

    it("extracts nested object without operators as single value", () => {
        const result = normalizeSelector({
            metadata: { nested: { deep: "value" } } as any,
        });
        // The nested object has no $ operators, so it's treated as equality and extracted whole
        expect(result.values).toEqual([{ nested: { deep: "value" } }]);
    });

    it("handles all value operators", () => {
        const selector = {
            field: {
                $eq: "a",
                $ne: "b",
                $gt: 1,
                $lt: 2,
                $gte: 3,
                $lte: 4,
                $in: [1, 2],
                $nin: [3, 4],
                $all: [5],
                $exists: true,
                $type: "string",
                $size: 3,
                $mod: [2, 0],
                $regex: "^test",
                $beginsWith: "pre",
            },
        };
        const result = normalizeSelector(selector);
        expect(result.values).toHaveLength(15);
    });

    it("handles invalid input gracefully", () => {
        const result = normalizeSelector(null as any);
        expect(result.template).toBeNull();
        expect(result.values).toEqual([]);
    });
});

describe("generateTemplateKey", () => {
    it("produces deterministic key for same input", () => {
        const template = { type: { $__idx: 0 } };
        const key1 = generateTemplateKey(template, "test");
        const key2 = generateTemplateKey(template, "test");
        expect(key1).toBe(key2);
    });

    it("produces different keys for different inputs", () => {
        const key1 = generateTemplateKey({ type: { $__idx: 0 } }, "test");
        const key2 = generateTemplateKey({ status: { $__idx: 0 } }, "test");
        expect(key1).not.toBe(key2);
    });

    it("produces different keys for different prefixes", () => {
        const template = { type: { $__idx: 0 } };
        const key1 = generateTemplateKey(template, "compile");
        const key2 = generateTemplateKey(template, "dexie");
        expect(key1).not.toBe(key2);
    });

    it("key format is prefix:hash", () => {
        const key = generateTemplateKey({ type: { $__idx: 0 } }, "myprefix");
        expect(key).toMatch(/^myprefix:.+$/);
    });
});
