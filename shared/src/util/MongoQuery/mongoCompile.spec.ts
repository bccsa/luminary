import { describe, it, expect } from "vitest";
import { mongoCompile } from "./mongoCompile";

describe("mongoCompile", () => {
    it("matches all for empty selector", () => {
        const pred = mongoCompile({});
        expect(pred({})).toBe(true);
        expect(pred({ a: 1 })).toBe(true);
    });

    it("returns false for non-object selector", () => {
        const pred = mongoCompile(null as any);
        expect(pred({})).toBe(false);
    });

    it("supports field equality", () => {
        const pred = mongoCompile({ city: "NYC" });
        expect(pred({ city: "NYC" })).toBe(true);
        expect(pred({ city: "LA" })).toBe(false);
        expect(pred({})).toBe(false);
    });

    it("supports $or", () => {
        const pred = mongoCompile({ $or: [{ city: "LA" }, { score: { $gte: 90 } }] });
        expect(pred({ city: "LA", score: 50 })).toBe(true);
        expect(pred({ city: "NYC", score: 95 })).toBe(true);
        expect(pred({ city: "NYC", score: 80 })).toBe(false);
    });

    it("supports $and", () => {
        const pred = mongoCompile({ $and: [{ city: "SF" }, { score: { $gte: 90 } }] });
        expect(pred({ city: "SF", score: 95 })).toBe(true);
        expect(pred({ city: "SF", score: 80 })).toBe(false);
        expect(pred({ city: "LA", score: 95 })).toBe(false);
    });

    it("supports numeric comparisons on primitive doc values ($gt/$lt/$gte/$lte)", () => {
        const gtPred = mongoCompile({ score: { $gt: 10 } });
        expect(gtPred({ score: 15 })).toBe(true);
        expect(gtPred({ score: 5 })).toBe(false);

        const ltPred = mongoCompile({ score: { $lt: 10 } });
        expect(ltPred({ score: 5 })).toBe(true);
        expect(ltPred({ score: 15 })).toBe(false);

        const gtePred = mongoCompile({ score: { $gte: 10 } });
        expect(gtePred({ score: 10 })).toBe(true);
        expect(gtePred({ score: 9 })).toBe(false);

        const ltePred = mongoCompile({ score: { $lte: 10 } });
        expect(ltePred({ score: 10 })).toBe(true);
        expect(ltePred({ score: 11 })).toBe(false);
    });

    it("treats non-number comparison values as falsey predicates", () => {
        // invalid comparison operand => predicate always false
        expect(mongoCompile({ score: { $gt: "x" as any } })({ score: 100 })).toBe(false);
        expect(mongoCompile({ score: { $lt: null as any } })({ score: -1 })).toBe(false);
        expect(mongoCompile({ score: { $gte: undefined as any } })({ score: 0 })).toBe(false);
        expect(mongoCompile({ score: { $lte: {} as any } })({ score: 0 })).toBe(false);
    });

    it("supports $ne", () => {
        const pred = mongoCompile({ score: { $ne: 5 } });
        expect(pred({ score: 4 })).toBe(true);
        expect(pred({ score: 5 })).toBe(false);
        expect(pred({ score: "5" })).toBe(true);
    });

    it("supports $in", () => {
        const pred = mongoCompile({
            score: { $in: [10, 20, 50, 99] },
            city: { $in: ["NYC", "LA"] },
        });
        expect(pred({ score: 10, city: "NYC" })).toBe(true);
        expect(pred({ score: 20, city: "LA" })).toBe(true);
        expect(pred({ score: 50, city: "NYC" })).toBe(true);
        expect(pred({ score: 99, city: "LA" })).toBe(true);
        expect(pred({ score: 30, city: "SF" })).toBe(false);
        expect(pred({ score: 10, city: "SF" })).toBe(false);
    });

    it("treats non-array $in as falsey predicate", () => {
        const pred = mongoCompile({ score: { $in: 10 } });
        expect(pred({ score: 10 })).toBe(false);
    });

    it("supports multiple comparators on one value ($gte, $lte)", () => {
        const pred = mongoCompile({ score: { $gte: 50, $lte: 70 } });
        expect(pred({ score: 50 })).toBe(true);
        expect(pred({ score: 70 })).toBe(true);
        expect(pred({ score: 60 })).toBe(true);
        expect(pred({ score: 40 })).toBe(false);
        expect(pred({ score: 80 })).toBe(false);
    });
});
