import { describe, it, expect } from "vitest";
import { isProvablyEmpty } from "./isProvablyEmpty";

describe("isProvablyEmpty", () => {
    describe("flags unsatisfiable selectors", () => {
        it("empty $in directly on a field", () => {
            expect(isProvablyEmpty({ tags: { $in: [] } })).toBe(true);
        });

        it("$elemMatch wrapping an empty $in", () => {
            expect(isProvablyEmpty({ parentTags: { $elemMatch: { $in: [] } } })).toBe(true);
        });

        it("empty $in under an explicit $and", () => {
            expect(
                isProvablyEmpty({
                    $and: [{ type: "content" }, { parentTags: { $elemMatch: { $in: [] } } }],
                }),
            ).toBe(true);
        });

        it("empty $in under an implicit AND (multiple top-level keys)", () => {
            expect(
                isProvablyEmpty({ type: "content", parentTags: { $elemMatch: { $in: [] } } }),
            ).toBe(true);
        });

        it("$or where EVERY branch is empty", () => {
            expect(
                isProvablyEmpty({ $or: [{ a: { $in: [] } }, { b: { $elemMatch: { $in: [] } } }] }),
            ).toBe(true);
        });

        it("empty $in alongside other criteria on the same field", () => {
            expect(isProvablyEmpty({ publishDate: { $in: [], $gte: 5 } })).toBe(true);
        });

        it("the real homepage-pinned shape (empty parentTags list)", () => {
            expect(
                isProvablyEmpty({
                    $and: [
                        { type: "content" },
                        { $or: [{ parentTagType: { $exists: false } }, { parentTagType: "topic" }] },
                        { parentTags: { $elemMatch: { $in: [] } } },
                        { status: "published" },
                        { publishDate: { $lte: 1780519803332 } },
                    ],
                }),
            ).toBe(true);
        });
    });

    describe("does NOT flag satisfiable (or unprovable) selectors", () => {
        it("non-empty $in", () => {
            expect(isProvablyEmpty({ tags: { $in: ["a"] } })).toBe(false);
        });

        it("$elemMatch with a non-empty $in", () => {
            expect(isProvablyEmpty({ parentTags: { $elemMatch: { $in: ["a"] } } })).toBe(false);
        });

        it("empty $in inside an $or that has a satisfiable branch", () => {
            expect(
                isProvablyEmpty({ $or: [{ a: { $in: [] } }, { b: "ok" }] }),
            ).toBe(false);
        });

        it("empty $in under $not (negation inverts — we bail)", () => {
            expect(isProvablyEmpty({ $not: { a: { $in: [] } } })).toBe(false);
        });

        it("empty $in under $nor (we bail)", () => {
            expect(isProvablyEmpty({ $nor: [{ a: { $in: [] } }] })).toBe(false);
        });

        it("no $in at all", () => {
            expect(isProvablyEmpty({ type: "content", status: "published" })).toBe(false);
        });

        it("empty $nin is satisfiable (matches everything)", () => {
            expect(isProvablyEmpty({ tags: { $nin: [] } })).toBe(false);
        });

        it("nullish / non-object selectors", () => {
            expect(isProvablyEmpty(undefined)).toBe(false);
            expect(isProvablyEmpty(null)).toBe(false);
            expect(isProvablyEmpty({} as any)).toBe(false);
            expect(isProvablyEmpty([] as any)).toBe(false);
        });
    });
});
