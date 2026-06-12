import { describe, it, expect } from "vitest";
import { sanitizeArrayOperators } from "./sanitizeArrayOperators";
import type { MangoSelector } from "./MangoTypes";

describe("sanitizeArrayOperators", () => {
    it("strips null from a top-level $in", () => {
        expect(sanitizeArrayOperators({ parentId: { $in: [null] } } as any)).toEqual({
            parentId: { $in: [] },
        });
    });

    it("strips null/undefined while keeping real members", () => {
        expect(
            sanitizeArrayOperators({ parentId: { $in: ["a", null, undefined, "b"] } } as any),
        ).toEqual({ parentId: { $in: ["a", "b"] } });
    });

    it("handles $nin and $all the same way", () => {
        expect(
            sanitizeArrayOperators({
                a: { $nin: ["x", null] },
                b: { $all: [null, "y"] },
            } as any),
        ).toEqual({ a: { $nin: ["x"] }, b: { $all: ["y"] } });
    });

    it("recurses through $and / $or / $elemMatch", () => {
        const selector = {
            $and: [
                { type: "content" },
                { parentId: { $in: ["p1", null] } },
                {
                    $or: [
                        { language: { $in: [null, "lang-eng"] } },
                        { memberOf: { $elemMatch: { $in: ["g1", null] } } },
                    ],
                },
            ],
        } as unknown as MangoSelector;

        expect(sanitizeArrayOperators(selector)).toEqual({
            $and: [
                { type: "content" },
                { parentId: { $in: ["p1"] } },
                {
                    $or: [
                        { language: { $in: ["lang-eng"] } },
                        { memberOf: { $elemMatch: { $in: ["g1"] } } },
                    ],
                },
            ],
        });
    });

    it("leaves a clean selector structurally equal", () => {
        const selector = {
            $and: [{ type: "content" }, { parentId: { $in: ["a", "b"] } }, { status: "published" }],
        } as unknown as MangoSelector;
        expect(sanitizeArrayOperators(selector)).toEqual(selector);
    });

    it("does not mutate the input", () => {
        const selector = { parentId: { $in: ["a", null] } } as any;
        const before = JSON.parse(JSON.stringify(selector));
        sanitizeArrayOperators(selector);
        expect(selector).toEqual(before);
        expect(selector.parentId.$in).toEqual(["a", null]);
    });

    it("does not touch non-array-operator fields (e.g. $eq: null stays)", () => {
        expect(sanitizeArrayOperators({ expiryDate: { $eq: null } } as any)).toEqual({
            expiryDate: { $eq: null },
        });
    });

    it("leaves a non-array $in value untouched (malformed — server rejects it)", () => {
        expect(sanitizeArrayOperators({ a: { $in: "oops" } } as any)).toEqual({
            a: { $in: "oops" },
        });
    });
});
