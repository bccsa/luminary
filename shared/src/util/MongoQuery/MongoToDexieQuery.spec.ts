import { mongoToDexieQuery } from "./MongoToDexieQuery";
import { Table } from "dexie";
import { expect, describe, it } from "vitest";

const DATA = [
    { _id: 1, name: "Alice", age: 30, city: "NYC", score: 85 },
    { _id: 2, name: "Bob", age: 25, city: "LA", score: 92 },
    { _id: 3, name: "Charlie", age: 35, city: "NYC", score: 78 },
    { _id: 4, name: "David", age: 40, city: "SF", score: 95 },
    { _id: 5, name: "Eve", age: 22, city: "SF", score: 88 },
];

describe("mongoToDexieQuery (where pushdown)", () => {
    // Simple in-memory Dexie-like mock
    function createMockTable<T>(data: T[]): Table<T> {
        const col = (arr: T[]) => ({
            and: (p: (o: T) => boolean) => col(arr.filter(p)),
            filter: (p: (o: T) => boolean) => col(arr.filter(p)),
            limit: (n: number) => col(arr.slice(0, Math.max(0, n))),
            orderBy: (index: string) =>
                col(
                    [...arr].sort((a: any, b: any) =>
                        a[index] < b[index] ? -1 : a[index] > b[index] ? 1 : 0,
                    ),
                ),
            reverse: () => col([...arr].reverse()),
            toArray: async () => arr,
        });
        return {
            where: (index: string) => ({
                equals: (v: any) => col(data.filter((d: any) => d[index] === v)),
                above: (v: any) => col(data.filter((d: any) => d[index] > v)),
                below: (v: any) => col(data.filter((d: any) => d[index] < v)),
                aboveOrEqual: (v: any) => col(data.filter((d: any) => d[index] >= v)),
                belowOrEqual: (v: any) => col(data.filter((d: any) => d[index] <= v)),
                notEqual: (v: any) => col(data.filter((d: any) => d[index] !== v)),
            }),
            orderBy: (index: string) =>
                col(
                    [...data].sort((a: any, b: any) =>
                        a[index] < b[index] ? -1 : a[index] > b[index] ? 1 : 0,
                    ),
                ),
            filter: (p: (o: T) => boolean) => col(data.filter(p)),
            limit: (n: number) => col(data.slice(0, Math.max(0, n))),
            toArray: async () => data,
        } as unknown as Table<T>;
    }

    it("pushes equality into where and uses residual filter", async () => {
        const table = createMockTable(DATA);
        const col = mongoToDexieQuery(
            table,
            { $and: [{ city: "NYC" }, { age: { $gt: 30 } }] },
            { indexedFields: ["city", "age"] },
        );
        const res = await col.toArray();
        // with pushdown of city === 'NYC', residual age>30 filters to id 3
        expect(res.map((d) => d._id)).toEqual([3]);
    });

    it("falls back to filter for $or across fields", async () => {
        const table = createMockTable(DATA);
        const col = mongoToDexieQuery(
            table,
            { $or: [{ city: "LA" }, { age: { $gt: 30 } }] },
            { indexedFields: ["city", "age"] },
        );
        const res = await col.toArray();
        expect(res.map((d) => d._id).sort()).toEqual([2, 3, 4]);
    });

    it("applies $limit when pushdown is used", async () => {
        const table = createMockTable(DATA);
        const col = mongoToDexieQuery(
            table,
            { $and: [{ city: "NYC" }, { age: { $gt: 20 } }], $limit: 1 },
            { indexedFields: ["city", "age"] },
        );
        const res = await col.toArray();
        expect(res).toHaveLength(1);
    });

    it("applies $limit in fallback filter path", async () => {
        const table = createMockTable(DATA);
        const col = mongoToDexieQuery(
            table,
            { $or: [{ city: "LA" }, { age: { $gt: 20 } }], $limit: 2 },
            { indexedFields: ["city", "age"] },
        );
        const res = await col.toArray();
        expect(res).toHaveLength(2);
    });

    it("uses orderBy/reverse for single-field sort", async () => {
        const table = createMockTable(DATA);
        const col1 = mongoToDexieQuery(table, { $sort: [{ age: "asc" }] });
        const r1 = await col1.toArray();
        expect(r1.map((d) => d._id)).toEqual([5, 2, 1, 3, 4]);

        const col2 = mongoToDexieQuery(table, { $sort: [{ age: "desc" }] });
        const r2 = await col2.toArray();
        expect(r2.map((d) => d._id)).toEqual([4, 3, 1, 2, 5]);
    });
});
