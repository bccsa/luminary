import { classifyQueryCost } from "./queryStats";

const thresholds = { docsExamined: 1000, examinedRatio: 10 };

describe("classifyQueryCost", () => {
    it("flags a query examining more than the absolute threshold", () => {
        const v = classifyQueryCost({ total_docs_examined: 1001 }, 1000, thresholds);
        expect(v.expensive).toBe(true);
        expect(v.reason).toBe("docs_examined");
    });

    it("does not flag at exactly the absolute threshold", () => {
        const v = classifyQueryCost({ total_docs_examined: 1000 }, 1000, thresholds);
        expect(v.expensive).toBe(false);
    });

    it("flags a high examined/returned ratio above the floor", () => {
        // 500 examined to return 5 → ratio 100 > 10, and 500 >= floor (100).
        const v = classifyQueryCost({ total_docs_examined: 500 }, 5, thresholds);
        expect(v.expensive).toBe(true);
        expect(v.reason).toBe("examined_ratio");
    });

    it("does not flag a high ratio below the examined floor", () => {
        // 90 examined to return 1 → ratio 90 > 10 but 90 < floor (100).
        const v = classifyQueryCost({ total_docs_examined: 90 }, 1, thresholds);
        expect(v.expensive).toBe(false);
    });

    it("treats zero results as 1 to avoid divide-by-zero, still flags a scan", () => {
        const v = classifyQueryCost({ total_docs_examined: 5000 }, 0, thresholds);
        expect(v.expensive).toBe(true);
        expect(v.ratio).toBe(5000);
    });

    it("is not expensive when stats are missing", () => {
        expect(classifyQueryCost(undefined, 10, thresholds).expensive).toBe(false);
        expect(classifyQueryCost({}, 10, thresholds).expensive).toBe(false);
    });

    it("null-guards a non-number total_docs_examined", () => {
        const v = classifyQueryCost({ total_docs_examined: undefined } as any, 10, thresholds);
        expect(v.expensive).toBe(false);
        expect(v.docsExamined).toBe(0);
    });
});
