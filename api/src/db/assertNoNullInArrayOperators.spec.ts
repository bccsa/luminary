import { assertNoNullInArrayOperators } from "./assertNoNullInArrayOperators";

describe("assertNoNullInArrayOperators", () => {
    it("throws on a top-level $in containing null (the reported crash shape)", () => {
        expect(() =>
            assertNoNullInArrayOperators({ selector: { parentId: { $in: [null] } } }),
        ).toThrow(/'\$in' array must not contain null/);
    });

    it("throws on null mixed with real ids", () => {
        expect(() =>
            assertNoNullInArrayOperators({ selector: { parentId: { $in: ["a", null, "b"] } } }),
        ).toThrow(/must not contain null/);
    });

    it("throws for $nin and $all too", () => {
        expect(() =>
            assertNoNullInArrayOperators({ selector: { a: { $nin: ["x", null] } } }),
        ).toThrow(/'\$nin' array must not contain null/);
        expect(() =>
            assertNoNullInArrayOperators({ selector: { a: { $all: [undefined, "y"] } } }),
        ).toThrow(/'\$all' array must not contain null/);
    });

    it("throws on null nested inside $and/$or/$elemMatch (recursive walk)", () => {
        expect(() =>
            assertNoNullInArrayOperators({
                selector: {
                    $and: [
                        { type: "content" },
                        { $or: [{ slug: "a" }, { parentId: { $in: ["x", null] } }] },
                    ],
                },
            }),
        ).toThrow(/must not contain null/);

        expect(() =>
            assertNoNullInArrayOperators({
                selector: { memberOf: { $elemMatch: { $in: ["g1", null] } } },
            }),
        ).toThrow(/must not contain null/);
    });

    it("does not throw on a clean selector", () => {
        expect(() =>
            assertNoNullInArrayOperators({
                selector: {
                    $and: [
                        { type: "content" },
                        { parentId: { $in: ["a", "b"] } },
                        { status: "published" },
                    ],
                },
            }),
        ).not.toThrow();
    });

    it("does not throw on an empty $in", () => {
        expect(() =>
            assertNoNullInArrayOperators({ selector: { parentId: { $in: [] } } }),
        ).not.toThrow();
    });

    it("does not throw when selector is missing/empty", () => {
        expect(() => assertNoNullInArrayOperators({})).not.toThrow();
        expect(() => assertNoNullInArrayOperators({ selector: {} })).not.toThrow();
    });

    it("does not flag a plain field equal to null (not an array operator)", () => {
        expect(() =>
            assertNoNullInArrayOperators({ selector: { expiryDate: { $eq: null } } }),
        ).not.toThrow();
    });
});
