import { expandMangoSelector } from "./expandMangoQuery";

describe("expandMangoSelector", () => {
    describe("basic field expansion", () => {
        it("should expand multiple field conditions into explicit $and", () => {
            const selector = {
                type: "Post",
                status: "published",
            };

            const result = expandMangoSelector(selector);

            expect(result).toEqual({
                $and: [{ type: "Post" }, { status: "published" }],
            });
        });

        it("should wrap single condition in $and", () => {
            const selector = {
                type: "Post",
            };

            const result = expandMangoSelector(selector);

            expect(result).toEqual({ $and: [{ type: "Post" }] });
        });

        it("should return empty $and for empty selector", () => {
            const result = expandMangoSelector({});

            expect(result).toEqual({ $and: [] });
        });
    });

    describe("existing $and handling", () => {
        it("should flatten existing $and into top-level $and", () => {
            const selector = {
                type: "Post",
                $and: [{ status: "published" }, { author: "Alice" }],
            };

            const result = expandMangoSelector(selector);

            expect(result).toEqual({
                $and: [{ status: "published" }, { author: "Alice" }, { type: "Post" }],
            });
        });

        it("should handle selector with only $and", () => {
            const selector = {
                $and: [{ type: "Post" }, { status: "published" }],
            };

            const result = expandMangoSelector(selector);

            expect(result).toEqual({
                $and: [{ type: "Post" }, { status: "published" }],
            });
        });

        it("should return same reference for already-normalized selector (fast path)", () => {
            const selector = {
                $and: [{ type: "Post" }, { status: "published" }],
            };

            const result = expandMangoSelector(selector);

            // Fast path should return the original object without modification
            expect(result).toBe(selector);
        });
    });

    describe("$or handling", () => {
        it("should include $or as a condition in $and", () => {
            const selector = {
                type: "Post",
                status: "published",
                $or: [{ author: "Alice" }, { author: "Bob" }],
            };

            const result = expandMangoSelector(selector);

            expect(result.$and).toBeDefined();
            expect(result.$and).toHaveLength(3);
            expect(result.$and).toContainEqual({ type: "Post" });
            expect(result.$and).toContainEqual({ status: "published" });
            expect(result.$and).toContainEqual({
                $or: [{ author: "Alice" }, { author: "Bob" }],
            });
        });

        it("should wrap selector with only $or in $and", () => {
            const selector = {
                $or: [{ type: "Post" }, { type: "Tag" }],
            };

            const result = expandMangoSelector(selector);

            expect(result).toEqual({
                $and: [{ $or: [{ type: "Post" }, { type: "Tag" }] }],
            });
        });
    });

    describe("comparison operators", () => {
        it("should handle fields with comparison operators", () => {
            const selector = {
                type: "Post",
                year: { $gt: 2020 },
                rating: { $gte: 4, $lte: 5 },
            };

            const result = expandMangoSelector(selector);

            expect(result).toEqual({
                $and: [
                    { type: "Post" },
                    { year: { $gt: 2020 } },
                    { rating: { $gte: 4, $lte: 5 } },
                ],
            });
        });

        it("should handle $in operator", () => {
            const selector = {
                type: "Post",
                status: { $in: ["published", "draft"] },
            };

            const result = expandMangoSelector(selector);

            expect(result).toEqual({
                $and: [{ type: "Post" }, { status: { $in: ["published", "draft"] } }],
            });
        });

        it("should handle $exists operator", () => {
            const selector = {
                type: "Post",
                expiryDate: { $exists: false },
            };

            const result = expandMangoSelector(selector);

            expect(result).toEqual({
                $and: [{ type: "Post" }, { expiryDate: { $exists: false } }],
            });
        });
    });

    describe("complex selectors", () => {
        it("should handle mixed fields and operators", () => {
            const selector = {
                type: "Content",
                parentType: "Post",
                status: "published",
                $or: [{ expiryDate: { $exists: false } }, { expiryDate: { $gt: Date.now() } }],
            };

            const result = expandMangoSelector(selector);

            expect(result.$and).toBeDefined();
            expect(result.$and).toHaveLength(4);
            expect(result.$and).toContainEqual({ type: "Content" });
            expect(result.$and).toContainEqual({ parentType: "Post" });
            expect(result.$and).toContainEqual({ status: "published" });
        });

        it("should handle $elemMatch", () => {
            const selector = {
                type: "Post",
                memberOf: {
                    $elemMatch: {
                        $in: ["group1", "group2"],
                    },
                },
            };

            const result = expandMangoSelector(selector);

            expect(result).toEqual({
                $and: [
                    { type: "Post" },
                    {
                        memberOf: {
                            $elemMatch: {
                                $in: ["group1", "group2"],
                            },
                        },
                    },
                ],
            });
        });
    });
});
