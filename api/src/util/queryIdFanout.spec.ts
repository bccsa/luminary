import { findIdInList, MAX_ID_FANOUT, runIdListFanout } from "./queryIdFanout";

describe("findIdInList", () => {
    it("finds a single-key `_id: { $in: [strings] }` clause and dedupes", () => {
        const and = [{ type: "content" }, { _id: { $in: ["a", "b", "a"] } }] as any;
        expect(findIdInList(and)).toEqual({ clause: and[1], ids: ["a", "b"] });
    });

    it("ignores an `_id` clause that carries other keys", () => {
        expect(findIdInList([{ _id: { $in: ["a"] }, type: "content" }] as any)).toBeUndefined();
    });

    it("ignores non-string ids, empty lists, and equality", () => {
        expect(findIdInList([{ _id: { $in: [] } }] as any)).toBeUndefined();
        expect(findIdInList([{ _id: { $in: [1, 2] } }] as any)).toBeUndefined();
        expect(findIdInList([{ _id: { $eq: "a" } }] as any)).toBeUndefined();
        expect(findIdInList(undefined)).toBeUndefined();
    });
});

describe("runIdListFanout", () => {
    const query = (extra: any = {}) => ({
        selector: { $and: [{ type: "content" }, { _id: { $in: ["a", "b"] } }] },
        ...extra,
    });

    it("issues one equality query per id and merges, summing execution stats", async () => {
        const q = query();
        const hit = findIdInList(q.selector.$and)!;
        const execFind = jest.fn(async (sub: any) => {
            const id = sub.selector.$and.find((c: any) => c._id?.$eq)._id.$eq;
            return { docs: [{ _id: id, updatedTimeUtc: id === "a" ? 10 : 20 }], execution_stats: { total_docs_examined: 1 } };
        });

        const res = await runIdListFanout(q as any, hit, execFind);

        expect(execFind).toHaveBeenCalledTimes(2);
        expect(res.docs.map((d: any) => d._id).sort()).toEqual(["a", "b"]);
        expect(res.execution_stats?.total_docs_examined).toBe(2);
        expect(res.blockStart).toBe(20);
        expect(res.blockEnd).toBe(10);
    });

    it("applies the original sort + limit to the merged result", async () => {
        const q = query({ sort: [{ updatedTimeUtc: "desc" }], limit: 1 });
        const hit = findIdInList(q.selector.$and)!;
        const execFind = jest.fn(async (sub: any) => {
            const id = sub.selector.$and.find((c: any) => c._id?.$eq)._id.$eq;
            return { docs: [{ _id: id, updatedTimeUtc: id === "a" ? 10 : 20 }] };
        });

        const res = await runIdListFanout(q as any, hit, execFind);

        expect(res.docs).toEqual([{ _id: "b", updatedTimeUtc: 20 }]);
    });

    it("strips a stale use_index from each sub-query", async () => {
        const q = query({ use_index: "some-index" });
        const hit = findIdInList(q.selector.$and)!;
        const execFind = jest.fn((sub: any) => Promise.resolve({ docs: [], _echo: sub }));

        await runIdListFanout(q as any, hit, execFind);

        for (const call of execFind.mock.calls) {
            expect((call[0] as any).use_index).toBeUndefined();
        }
    });
});

it("MAX_ID_FANOUT is a sane cap", () => {
    expect(MAX_ID_FANOUT).toBeGreaterThanOrEqual(25);
    expect(MAX_ID_FANOUT).toBeLessThanOrEqual(500);
});
