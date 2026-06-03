import { describe, it, expect } from "vitest";
import { applySortLimit, mergeById } from "./mergeDocs";

type Doc = { _id: string; updatedTimeUtc: number; publishDate?: number | null; tag?: string };

describe("mergeById", () => {
    it("unions docs from both arrays by _id", () => {
        const a: Doc[] = [{ _id: "a", updatedTimeUtc: 1 }];
        const b: Doc[] = [{ _id: "b", updatedTimeUtc: 1 }];
        const merged = mergeById(a as any, b as any);
        expect(merged.map((d) => d._id).sort()).toEqual(["a", "b"]);
    });

    it("keeps the copy with the higher updatedTimeUtc", () => {
        const a: Doc[] = [{ _id: "a", updatedTimeUtc: 5, tag: "local" }];
        const b: Doc[] = [{ _id: "a", updatedTimeUtc: 10, tag: "remote" }];
        const merged = mergeById(a as any, b as any);
        expect(merged).toHaveLength(1);
        expect(merged[0].tag).toBe("remote");
    });

    it("does not let an older b override a newer a", () => {
        const a: Doc[] = [{ _id: "a", updatedTimeUtc: 10, tag: "local" }];
        const b: Doc[] = [{ _id: "a", updatedTimeUtc: 5, tag: "remote" }];
        const merged = mergeById(a as any, b as any);
        expect(merged[0].tag).toBe("local");
    });

    it("on a timestamp tie, b wins (b is the fresher source)", () => {
        const a: Doc[] = [{ _id: "a", updatedTimeUtc: 5, tag: "local" }];
        const b: Doc[] = [{ _id: "a", updatedTimeUtc: 5, tag: "remote" }];
        const merged = mergeById(a as any, b as any);
        expect(merged[0].tag).toBe("remote");
    });
});

describe("applySortLimit", () => {
    const docs: Doc[] = [
        { _id: "a", updatedTimeUtc: 1, publishDate: 10 },
        { _id: "b", updatedTimeUtc: 1, publishDate: 30 },
        { _id: "c", updatedTimeUtc: 1, publishDate: 20 },
    ];

    it("sorts descending by the first sort field", () => {
        const out = applySortLimit([...docs], [{ publishDate: "desc" }]);
        expect(out.map((d) => d.publishDate)).toEqual([30, 20, 10]);
    });

    it("sorts ascending by the first sort field", () => {
        const out = applySortLimit([...docs], [{ publishDate: "asc" }]);
        expect(out.map((d) => d.publishDate)).toEqual([10, 20, 30]);
    });

    it("applies sort then limit", () => {
        const out = applySortLimit([...docs], [{ publishDate: "desc" }], 2);
        expect(out.map((d) => d.publishDate)).toEqual([30, 20]);
    });

    it("applies limit without sort (preserving input order)", () => {
        const out = applySortLimit([...docs], undefined, 2);
        expect(out.map((d) => d._id)).toEqual(["a", "b"]);
    });

    it("orders null/undefined sort values first ascending (last when desc)", () => {
        const withNull: Doc[] = [
            { _id: "x", updatedTimeUtc: 1, publishDate: 5 },
            { _id: "y", updatedTimeUtc: 1, publishDate: null },
        ];
        expect(applySortLimit([...withNull], [{ publishDate: "asc" }]).map((d) => d._id)).toEqual([
            "y",
            "x",
        ]);
        expect(applySortLimit([...withNull], [{ publishDate: "desc" }]).map((d) => d._id)).toEqual([
            "x",
            "y",
        ]);
    });

    it("does not mutate the input array", () => {
        const input = [...docs];
        const snapshot = input.map((d) => d._id);
        applySortLimit(input, [{ publishDate: "desc" }], 1);
        expect(input.map((d) => d._id)).toEqual(snapshot);
    });
});
