import { mongoToDexieFilter } from "./MongoToDexieFilter";
import { expect, describe, it } from "vitest";

const DATA = [
    { _id: 1, name: "Alice", age: 30, city: "NYC", score: 85 },
    { _id: 2, name: "Bob", age: 25, city: "LA", score: 92 },
    { _id: 3, name: "Charlie", age: 35, city: "NYC", score: 78 },
    { _id: 4, name: "David", age: 40, city: "SF", score: 95 },
    { _id: 5, name: "Eve", age: 22, city: "SF", score: 88 },
];

describe("mongoToDexieFilter", () => {
    it("returns all docs for empty query", () => {
        const pred = mongoToDexieFilter({});
        expect(DATA.filter(pred)).toHaveLength(DATA.length);
    });

    it("handles equality", () => {
        const pred = mongoToDexieFilter({ city: "NYC" });
        expect(DATA.filter(pred).map((d) => d._id)).toEqual([1, 3]);
    });

    it("handles comparisons", () => {
        const gt = mongoToDexieFilter({ age: { $gt: 30 } });
        expect(
            DATA.filter(gt)
                .map((d) => d._id)
                .sort(),
        ).toEqual([3, 4]);

        const ne = mongoToDexieFilter({ score: { $ne: 92 } });
        expect(DATA.filter(ne).map((d) => d._id)).toEqual([1, 3, 4, 5]);
    });

    it("handles $or", () => {
        const pred = mongoToDexieFilter({ $or: [{ city: "LA" }, { score: { $gte: 95 } }] });
        expect(
            DATA.filter(pred)
                .map((d) => d._id)
                .sort(),
        ).toEqual([2, 4]);
    });

    it("handles $and", () => {
        const pred = mongoToDexieFilter({ $and: [{ city: "SF" }, { score: { $gte: 90 } }] });
        expect(DATA.filter(pred).map((d) => d._id)).toEqual([4]);
    });

    it("returns none for unsupported complex structure", () => {
        const pred = mongoToDexieFilter({ city: "NYC", age: { $gt: 20 } } as any);
        expect(DATA.filter(pred)).toEqual([]);
    });
});
