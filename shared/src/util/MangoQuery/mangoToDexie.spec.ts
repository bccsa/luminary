import { describe, it, expect, beforeEach } from "vitest";
import { mangoToDexie, clearDexieCache, getDexieCacheStats } from "./mangoToDexie";
import { mangoCompile, clearMangoCache, getMangoCacheStats } from "./mangoCompile";
import { clearAllMangoCache, getCacheStats } from "./queryCache";

type Doc = {
    id: number;
    a?: number | string;
    b?: string | number;
    c?: number;
    d?: number;
    age?: number;
    active?: boolean;
    status?: number;
    name?: string;
    title?: string;
    score?: number;
    tags?: string[];
    type?: string;
};

class FakeCollection<T extends Record<string, any>> {
    constructor(public items: T[]) {}
    reverse() {
        return new FakeCollection([...this.items].reverse());
    }
    filter(pred: (d: T) => boolean) {
        return new FakeCollection(this.items.filter(pred));
    }
    limit(n: number) {
        return new FakeCollection(this.items.slice(0, Math.max(0, n)));
    }
    toArray() {
        return Promise.resolve(this.items);
    }
    sortBy(field: string) {
        const sorted = [...this.items].sort((a, b) => {
            const av = a[field];
            const bv = b[field];
            if (av == null && bv == null) return 0;
            if (av == null) return -1;
            if (bv == null) return 1;
            if (typeof av === "number" && typeof bv === "number") return av - bv;
            if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv);
            return 0;
        });
        return Promise.resolve(sorted);
    }
}

class FakeClause<T extends Record<string, any>> {
    constructor(
        private table: FakeTable<T>,
        private field: string,
    ) {}
    private get v() {
        return this.table.data;
    }
    private setOp(op: string) {
        this.table.lastWhereField = this.field;
        this.table.lastClauseOp = op;
    }
    equals(value: any) {
        this.setOp("equals");
        return new FakeCollection(this.v.filter((d) => d[this.field] === value));
    }
    above(value: any) {
        this.setOp("above");
        return new FakeCollection(this.v.filter((d) => d[this.field] > value));
    }
    below(value: any) {
        this.setOp("below");
        return new FakeCollection(this.v.filter((d) => d[this.field] < value));
    }
    aboveOrEqual(value: any) {
        this.setOp("aboveOrEqual");
        return new FakeCollection(this.v.filter((d) => d[this.field] >= value));
    }
    belowOrEqual(value: any) {
        this.setOp("belowOrEqual");
        return new FakeCollection(this.v.filter((d) => d[this.field] <= value));
    }
    notEqual(value: any) {
        this.setOp("notEqual");
        return new FakeCollection(this.v.filter((d) => d[this.field] !== value));
    }
    anyOf(values: any[]) {
        this.setOp("anyOf");
        const set = new Set(values);
        return new FakeCollection(this.v.filter((d) => set.has(d[this.field])));
    }
    startsWith(prefix: string) {
        this.setOp("startsWith");
        return new FakeCollection(
            this.v.filter((d) => typeof d[this.field] === "string" && d[this.field].startsWith(prefix)),
        );
    }
    between(lower: any, upper: any, includeLower = true, includeUpper = false) {
        this.setOp("between");
        this.table.lastBetweenArgs = { lower, upper, includeLower, includeUpper };
        return new FakeCollection(
            this.v.filter((d) => {
                const val = d[this.field];
                if (val == null) return false;
                const aboveLower = includeLower ? val >= lower : val > lower;
                const belowUpper = includeUpper ? val <= upper : val < upper;
                return aboveLower && belowUpper;
            }),
        );
    }
}

class FakeTable<T extends Record<string, any>> {
    public lastWhereArg?: Record<string, any>;
    public lastWhereField?: string;
    public lastClauseOp?: string;
    public lastBetweenArgs?: { lower: any; upper: any; includeLower: boolean; includeUpper: boolean };
    public lastBulkGetKeys?: any[];
    public schema: { primKey: { keyPath: string } };
    constructor(public data: T[], primaryKey = "id") {
        this.schema = { primKey: { keyPath: primaryKey } };
    }

    orderBy(field: string) {
        const sorted = [...this.data].sort((a, b) => {
            const av = a[field];
            const bv = b[field];
            if (av == null && bv == null) return 0;
            if (av == null) return -1;
            if (bv == null) return 1;
            if (typeof av === "number" && typeof bv === "number") return av - bv;
            if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv);
            return 0;
        });
        return new FakeCollection(sorted);
    }

    filter(pred: (d: T) => boolean) {
        return new FakeCollection(this.data.filter(pred));
    }

    bulkGet(keys: any[]): Promise<(T | undefined)[]> {
        this.lastBulkGetKeys = keys;
        const keyField = this.schema.primKey.keyPath;
        return Promise.resolve(
            keys.map((key) => this.data.find((d) => (d as any)[keyField] === key)),
        );
    }

    // where(field) -> clause; where(object) -> collection
    where(arg: any): any {
        if (typeof arg === "string") {
            return new FakeClause<T>(this, arg);
        }
        if (arg && typeof arg === "object" && !Array.isArray(arg)) {
            this.lastWhereArg = arg;
            const entries = Object.entries(arg);
            const out = this.data.filter((d) => entries.every(([k, v]) => d[k] === v));
            return new FakeCollection(out);
        }
        throw new Error("Unsupported where arg");
    }
}

describe("mangoToDexie", () => {
    // ============================================
    // Multi-equality pushdown
    // ============================================

    describe("multi-equality pushdown", () => {
        it("pushes combined simple equalities (excluding booleans) via where({ ... })", async () => {
            const docs: Doc[] = [
                { id: 1, a: 1, b: "x", c: 3, active: true },
                { id: 2, a: 1, b: "x", c: 3, active: false },
                { id: 3, a: 1, b: "y", c: 3, active: true },
                { id: 4, a: 2, b: "x", c: 3, active: true },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { a: 1, b: "x", $and: [{ c: 3 }, { active: true }] } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastWhereArg).toEqual({ a: 1, b: "x", c: 3 });
            expect(res.map((d) => d.id)).toEqual([1]);
            expect(res.every((d) => d.active === true)).toBe(true);
        });

        it("never pushes boolean equalities to where()", async () => {
            const docs: Doc[] = [
                { id: 1, name: "Alice", active: true },
                { id: 2, name: "Alice", active: false },
                { id: 3, name: "Bob", active: true },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { name: "Alice", active: true } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastWhereArg).toEqual({ name: "Alice" });
            expect(res.map((d) => d.id)).toEqual([1]);
        });
    });

    // ============================================
    // $in / anyOf pushdown
    // ============================================

    describe("$in pushdown", () => {
        it("prefers anyOf for $in and applies residual filters", async () => {
            const docs: Doc[] = [
                { id: 1, a: 1, d: 4 },
                { id: 2, a: 1, d: 6 },
                { id: 3, a: 2, d: 10 },
                { id: 4, a: 3, d: 7 },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { a: { $in: [1, 2] }, d: { $gt: 5 } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastWhereField).toBe("a");
            expect(table.lastClauseOp).toBe("anyOf");
            expect(res.map((d) => d.id)).toEqual([2, 3]);
        });

        it("removes $in from residual and keeps other ops on same field", async () => {
            const docs: Doc[] = [
                { id: 1, status: 1 },
                { id: 2, status: 2 },
                { id: 3, status: 3 },
                { id: 4, status: 4 },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { status: { $in: [1, 2, 3], $gte: 2 } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastWhereField).toBe("status");
            expect(table.lastClauseOp).toBe("anyOf");
            expect(res.map((d) => d.id)).toEqual([2, 3]);
        });
    });

    // ============================================
    // $in / bulkGet pushdown (primary key)
    // ============================================

    describe("$in bulkGet pushdown (primary key)", () => {
        it("uses bulkGet when $in targets the primary key", async () => {
            const docs: Doc[] = [
                { id: 1, name: "Alice" },
                { id: 2, name: "Bob" },
                { id: 3, name: "Charlie" },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { id: { $in: [1, 3] } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastBulkGetKeys).toEqual([1, 3]);
            expect(table.lastWhereField).toBeUndefined();
            expect(res.map((d) => d.id)).toEqual([1, 3]);
        });

        it("applies residual filter after bulkGet", async () => {
            const docs: Doc[] = [
                { id: 1, name: "Alice", active: true },
                { id: 2, name: "Bob", active: false },
                { id: 3, name: "Charlie", active: true },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { id: { $in: [1, 2, 3] }, active: true } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastBulkGetKeys).toEqual([1, 2, 3]);
            expect(res.map((d) => d.id)).toEqual([1, 3]);
        });

        it("filters out missing keys from bulkGet", async () => {
            const docs: Doc[] = [
                { id: 1, name: "Alice" },
                { id: 3, name: "Charlie" },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { id: { $in: [1, 2, 3] } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastBulkGetKeys).toEqual([1, 2, 3]);
            expect(res.map((d) => d.id)).toEqual([1, 3]);
        });

        it("applies sort after bulkGet", async () => {
            const docs: Doc[] = [
                { id: 1, name: "Charlie", age: 40 },
                { id: 2, name: "Alice", age: 20 },
                { id: 3, name: "Bob", age: 30 },
            ];
            const table = new FakeTable(docs);
            const query = {
                selector: { id: { $in: [1, 2, 3] } },
                $sort: [{ age: "asc" }],
            };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastBulkGetKeys).toEqual([1, 2, 3]);
            expect(res.map((d) => d.id)).toEqual([2, 3, 1]);
        });

        it("applies sort desc after bulkGet", async () => {
            const docs: Doc[] = [
                { id: 1, name: "Charlie", age: 40 },
                { id: 2, name: "Alice", age: 20 },
                { id: 3, name: "Bob", age: 30 },
            ];
            const table = new FakeTable(docs);
            const query = {
                selector: { id: { $in: [1, 2, 3] } },
                $sort: [{ age: "desc" }],
            };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastBulkGetKeys).toEqual([1, 2, 3]);
            expect(res.map((d) => d.id)).toEqual([1, 3, 2]);
        });

        it("applies limit after bulkGet", async () => {
            const docs: Doc[] = [
                { id: 1, name: "Alice" },
                { id: 2, name: "Bob" },
                { id: 3, name: "Charlie" },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { id: { $in: [1, 2, 3] } }, $limit: 2 };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastBulkGetKeys).toEqual([1, 2, 3]);
            expect(res).toHaveLength(2);
        });

        it("applies sort + limit after bulkGet", async () => {
            const docs: Doc[] = [
                { id: 1, age: 40 },
                { id: 2, age: 20 },
                { id: 3, age: 30 },
            ];
            const table = new FakeTable(docs);
            const query = {
                selector: { id: { $in: [1, 2, 3] } },
                $sort: [{ age: "asc" }],
                $limit: 2,
            };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastBulkGetKeys).toEqual([1, 2, 3]);
            expect(res.map((d) => d.id)).toEqual([2, 3]);
        });

        it("does not use bulkGet when $in targets a non-primary-key field", async () => {
            const docs: Doc[] = [
                { id: 1, a: 1, d: 4 },
                { id: 2, a: 1, d: 6 },
                { id: 3, a: 2, d: 10 },
                { id: 4, a: 3, d: 7 },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { a: { $in: [1, 2] } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastBulkGetKeys).toBeUndefined();
            expect(table.lastWhereField).toBe("a");
            expect(table.lastClauseOp).toBe("anyOf");
            expect(res.map((d) => d.id)).toEqual([1, 2, 3]);
        });

        it("handles empty $in array via bulkGet", async () => {
            const docs: Doc[] = [
                { id: 1, name: "Alice" },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { id: { $in: [] } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastBulkGetKeys).toEqual([]);
            expect(res).toHaveLength(0);
        });
    });

    // ============================================
    // Single comparator pushdown
    // ============================================

    describe("single comparator pushdown", () => {
        it("pushes $gte as aboveOrEqual", async () => {
            const docs: Doc[] = [
                { id: 1, age: 20 },
                { id: 2, age: 30 },
                { id: 3, age: 40 },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { age: { $gte: 30 } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastWhereField).toBe("age");
            expect(table.lastClauseOp).toBe("aboveOrEqual");
            expect(res.map((d) => d.id)).toEqual([2, 3]);
        });

        it("pushes $gt as above", async () => {
            const docs: Doc[] = [
                { id: 1, age: 20 },
                { id: 2, age: 30 },
                { id: 3, age: 40 },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { age: { $gt: 20 } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastClauseOp).toBe("above");
            expect(res.map((d) => d.id)).toEqual([2, 3]);
        });

        it("pushes $lt as below", async () => {
            const docs: Doc[] = [
                { id: 1, age: 20 },
                { id: 2, age: 30 },
                { id: 3, age: 40 },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { age: { $lt: 30 } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastClauseOp).toBe("below");
            expect(res.map((d) => d.id)).toEqual([1]);
        });

        it("pushes $lte as belowOrEqual", async () => {
            const docs: Doc[] = [
                { id: 1, age: 20 },
                { id: 2, age: 30 },
                { id: 3, age: 40 },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { age: { $lte: 30 } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastClauseOp).toBe("belowOrEqual");
            expect(res.map((d) => d.id)).toEqual([1, 2]);
        });

        it("pushes $ne as notEqual", async () => {
            const docs: Doc[] = [
                { id: 1, name: "Alice" },
                { id: 2, name: "Bob" },
                { id: 3, name: "Charlie" },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { name: { $ne: "Bob" } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastClauseOp).toBe("notEqual");
            expect(res.map((d) => d.id)).toEqual([1, 3]);
        });

        it("pushes $eq via multiEq (preferred) or equals", async () => {
            const docs: Doc[] = [
                { id: 1, name: "Alice" },
                { id: 2, name: "Bob" },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { name: { $eq: "Alice" } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            // multiEq is preferred over single equals, both are functionally equivalent
            expect(table.lastWhereArg).toEqual({ name: "Alice" });
            expect(res.map((d) => d.id)).toEqual([1]);
        });
    });

    // ============================================
    // $beginsWith / startsWith pushdown
    // ============================================

    describe("$beginsWith pushdown", () => {
        it("pushes $beginsWith as startsWith", async () => {
            const docs: Doc[] = [
                { id: 1, title: "The Matrix" },
                { id: 2, title: "The Godfather" },
                { id: 3, title: "Inception" },
                { id: 4, title: "Theory of Everything" },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { title: { $beginsWith: "The " } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastWhereField).toBe("title");
            expect(table.lastClauseOp).toBe("startsWith");
            expect(res.map((d) => d.id)).toEqual([1, 2]);
        });

        it("applies residual filters after startsWith", async () => {
            const docs: Doc[] = [
                { id: 1, title: "The Matrix", score: 90 },
                { id: 2, title: "The Godfather", score: 95 },
                { id: 3, title: "The Room", score: 30 },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { title: { $beginsWith: "The " }, score: { $gte: 80 } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastClauseOp).toBe("startsWith");
            expect(res.map((d) => d.id)).toEqual([1, 2]);
        });
    });

    // ============================================
    // Combined $gte + $lte / between pushdown
    // ============================================

    describe("between pushdown", () => {
        it("pushes combined $gte + $lte as between", async () => {
            const docs: Doc[] = [
                { id: 1, score: 50 },
                { id: 2, score: 70 },
                { id: 3, score: 80 },
                { id: 4, score: 90 },
                { id: 5, score: 100 },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { score: { $gte: 70, $lte: 90 } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastWhereField).toBe("score");
            expect(table.lastClauseOp).toBe("between");
            expect(table.lastBetweenArgs).toEqual({
                lower: 70,
                upper: 90,
                includeLower: true,
                includeUpper: true,
            });
            expect(res.map((d) => d.id)).toEqual([2, 3, 4]);
        });

        it("pushes combined $gt + $lt as between with exclusive bounds", async () => {
            const docs: Doc[] = [
                { id: 1, score: 70 },
                { id: 2, score: 80 },
                { id: 3, score: 90 },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { score: { $gt: 70, $lt: 90 } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastClauseOp).toBe("between");
            expect(table.lastBetweenArgs).toEqual({
                lower: 70,
                upper: 90,
                includeLower: false,
                includeUpper: false,
            });
            expect(res.map((d) => d.id)).toEqual([2]);
        });

        it("pushes combined $gte + $lt as between with mixed bounds", async () => {
            const docs: Doc[] = [
                { id: 1, score: 70 },
                { id: 2, score: 80 },
                { id: 3, score: 90 },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { score: { $gte: 70, $lt: 90 } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(table.lastBetweenArgs).toEqual({
                lower: 70,
                upper: 90,
                includeLower: true,
                includeUpper: false,
            });
            expect(res.map((d) => d.id)).toEqual([1, 2]);
        });
    });

    // ============================================
    // Sorting path
    // ============================================

    describe("sorting path", () => {
        it("uses orderBy for sort+limit (desc) with early termination", async () => {
            const docs: Doc[] = [
                { id: 1, name: "Alice", age: 25, active: true },
                { id: 2, name: "Alice", age: 35, active: true },
                { id: 3, name: "Alice", age: 30, active: false },
                { id: 4, name: "Bob", age: 50, active: true },
            ];
            const table = new FakeTable(docs);
            const query = {
                selector: { name: "Alice", active: true },
                $sort: [{ age: "desc" }],
                $limit: 1,
            };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(res.map((d) => d.id)).toEqual([2]);
        });

        it("uses pushdown + sortBy for sort without limit (asc)", async () => {
            const docs: Doc[] = [
                { id: 1, age: 30 },
                { id: 2, age: 20 },
                { id: 3, age: 40 },
            ];
            const table = new FakeTable(docs);
            const query = {
                selector: {},
                $sort: [{ age: "asc" }],
            };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(res.map((d) => d.id)).toEqual([2, 1, 3]);
        });

        it("uses pushdown + sortBy for sort without limit (desc)", async () => {
            const docs: Doc[] = [
                { id: 1, age: 30 },
                { id: 2, age: 20 },
                { id: 3, age: 40 },
            ];
            const table = new FakeTable(docs);
            const query = {
                selector: {},
                $sort: [{ age: "desc" }],
            };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(res.map((d) => d.id)).toEqual([3, 1, 2]);
        });

        it("filters using pushdown before sorting when no limit", async () => {
            const docs: Doc[] = [
                { id: 1, name: "Alice", age: 25 },
                { id: 2, name: "Alice", age: 35 },
                { id: 3, name: "Bob", age: 30 },
                { id: 4, name: "Alice", age: 20 },
            ];
            const table = new FakeTable(docs);
            const query = {
                selector: { name: "Alice" },
                $sort: [{ age: "asc" }],
            };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            // Should use pushdown for name="Alice", then sort by age
            expect(table.lastWhereArg).toEqual({ name: "Alice" });
            expect(res.map((d) => d.id)).toEqual([4, 1, 2]);
        });
    });

    // ============================================
    // In-memory fallback for unsupported operators
    // ============================================

    describe("in-memory fallback", () => {
        it("handles $or in memory", async () => {
            const docs: Doc[] = [
                { id: 1, name: "Alice" },
                { id: 2, name: "Bob" },
                { id: 3, name: "Charlie" },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { $or: [{ name: "Alice" }, { name: "Charlie" }] } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            // No pushdown for $or
            expect(table.lastWhereArg).toBeUndefined();
            expect(table.lastWhereField).toBeUndefined();
            expect(res.map((d) => d.id)).toEqual([1, 3]);
        });

        it("handles $not in memory", async () => {
            const docs: Doc[] = [
                { id: 1, name: "Alice" },
                { id: 2, name: "Bob" },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { $not: { name: "Alice" } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(res.map((d) => d.id)).toEqual([2]);
        });

        it("handles $nor in memory", async () => {
            const docs: Doc[] = [
                { id: 1, name: "Alice" },
                { id: 2, name: "Bob" },
                { id: 3, name: "Charlie" },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { $nor: [{ name: "Alice" }, { name: "Bob" }] } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(res.map((d) => d.id)).toEqual([3]);
        });

        it("handles $nin in memory", async () => {
            const docs: Doc[] = [
                { id: 1, status: 1 },
                { id: 2, status: 2 },
                { id: 3, status: 3 },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { status: { $nin: [1, 2] } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(res.map((d) => d.id)).toEqual([3]);
        });

        it("handles $exists in memory", async () => {
            const docs: Doc[] = [
                { id: 1, name: "Alice" },
                { id: 2 },
                { id: 3, name: "Charlie" },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { name: { $exists: true } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(res.map((d) => d.id)).toEqual([1, 3]);
        });

        it("handles $type in memory", async () => {
            const docs: Doc[] = [
                { id: 1, a: 10 },
                { id: 2, a: "hello" },
                { id: 3, a: 20 },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { a: { $type: "number" } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(res.map((d) => d.id)).toEqual([1, 3]);
        });

        it("handles $regex in memory", async () => {
            const docs: Doc[] = [
                { id: 1, name: "Alice" },
                { id: 2, name: "Bob" },
                { id: 3, name: "Alicia" },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { name: { $regex: "^Ali" } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(res.map((d) => d.id)).toEqual([1, 3]);
        });

        it("handles $mod in memory", async () => {
            const docs: Doc[] = [
                { id: 1, a: 10 },
                { id: 2, a: 11 },
                { id: 3, a: 20 },
                { id: 4, a: 21 },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { a: { $mod: [10, 1] } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(res.map((d) => d.id)).toEqual([2, 4]);
        });

        it("handles $size in memory", async () => {
            const docs: Doc[] = [
                { id: 1, tags: ["a"] },
                { id: 2, tags: ["a", "b"] },
                { id: 3, tags: ["a", "b", "c"] },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { tags: { $size: 2 } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(res.map((d) => d.id)).toEqual([2]);
        });

        it("handles $all in memory", async () => {
            const docs: Doc[] = [
                { id: 1, tags: ["a", "b"] },
                { id: 2, tags: ["a", "c"] },
                { id: 3, tags: ["a", "b", "c"] },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { tags: { $all: ["a", "b"] } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(res.map((d) => d.id)).toEqual([1, 3]);
        });

        it("handles $elemMatch in memory", async () => {
            const docs: Doc[] = [
                { id: 1, tags: ["horror", "comedy"] },
                { id: 2, tags: ["drama", "romance"] },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { tags: { $elemMatch: { $eq: "horror" } } } };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(res.map((d) => d.id)).toEqual([1]);
        });
    });

    // ============================================
    // Complex queries
    // ============================================

    describe("complex queries", () => {
        it("handles complex nested query with partial pushdown", async () => {
            const docs: Doc[] = [
                { id: 1, type: "post", status: 1, active: true },
                { id: 2, type: "post", status: 2, active: true },
                { id: 3, type: "comment", status: 1, active: true },
                { id: 4, type: "post", status: 1, active: false },
            ];
            const table = new FakeTable(docs);
            const query = {
                selector: {
                    type: "post",
                    status: { $in: [1, 2] },
                    active: true,
                },
            };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            // Should push type: "post" as multiEq, filter the rest in memory
            expect(res.map((d) => d.id)).toEqual([1, 2]);
        });

        it("applies $limit correctly", async () => {
            const docs: Doc[] = [
                { id: 1, a: 1 },
                { id: 2, a: 1 },
                { id: 3, a: 1 },
                { id: 4, a: 1 },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { a: 1 }, $limit: 2 };
            const res = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            expect(res).toHaveLength(2);
        });
    });

    // ============================================
    // Caching
    // ============================================

    describe("caching", () => {
        beforeEach(() => {
            clearDexieCache();
        });

        it("caches query analysis results", () => {
            const docs: Doc[] = [
                { id: 1, name: "Alice", age: 30 },
                { id: 2, name: "Bob", age: 25 },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { name: "Alice", age: { $gte: 25 } } };

            // First call - should analyze and cache
            mangoToDexie(table as any, query as any);
            const stats1 = getDexieCacheStats();
            expect(stats1.size).toBe(1);

            // Second call with same query - should use cache
            mangoToDexie(table as any, query as any);
            const stats2 = getDexieCacheStats();
            expect(stats2.size).toBe(1); // Still only 1 entry
        });

        it("caches different queries separately", () => {
            const docs: Doc[] = [{ id: 1, a: 1, b: 2 }];
            const table = new FakeTable(docs);

            mangoToDexie(table as any, { selector: { a: 1 } } as any);
            mangoToDexie(table as any, { selector: { b: 2 } } as any);
            mangoToDexie(table as any, { selector: { a: 1, b: 2 } } as any);

            const stats = getDexieCacheStats();
            expect(stats.size).toBe(3);
        });

        it("clearDexieCache removes all cached entries", () => {
            const docs: Doc[] = [{ id: 1, a: 1 }];
            const table = new FakeTable(docs);

            // With template-based caching, { a: 1 } and { a: 2 } share the same template
            mangoToDexie(table as any, { selector: { a: 1 } } as any);
            mangoToDexie(table as any, { selector: { a: 2 } } as any);
            // Use a different structure to get a second cache entry
            mangoToDexie(table as any, { selector: { b: 1 } } as any);

            expect(getDexieCacheStats().size).toBe(2);

            clearDexieCache();

            expect(getDexieCacheStats().size).toBe(0);
        });

        it("returns correct results from cached analysis", async () => {
            const docs: Doc[] = [
                { id: 1, name: "Alice", score: 90 },
                { id: 2, name: "Bob", score: 80 },
                { id: 3, name: "Alice", score: 70 },
            ];
            const table = new FakeTable(docs);
            const query = { selector: { name: "Alice", score: { $gte: 80 } } };

            // First call
            const res1 = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            // Second call (from cache)
            const res2 = await mangoToDexie(table as any, query as any) as unknown as Doc[];

            // Both should return the same results
            expect(res1.map((d) => d.id)).toEqual([1]);
            expect(res2.map((d) => d.id)).toEqual([1]);
        });

        it("uses separate cache keys from mangoCompile for the same query", () => {
            // Clear all caches first
            clearAllMangoCache();

            const docs: Doc[] = [{ id: 1, name: "Alice" }];
            const table = new FakeTable(docs);
            const selector = { name: "Alice" };

            // Use the same selector in both mangoCompile and mangoToDexie
            mangoCompile(selector);
            mangoToDexie(table as any, { selector } as any);

            // Check that both have separate cache entries
            const compileStats = getMangoCacheStats();
            const dexieStats = getDexieCacheStats();

            // mangoCompile should have its own cache entry (now uses tp: prefix for template)
            expect(compileStats.size).toBe(1);
            expect(compileStats.keys[0]).toMatch(/^tp:/);

            // mangoToDexie should have its own cache entries (now uses td: prefix for template)
            expect(dexieStats.size).toBe(1);
            expect(dexieStats.keys[0]).toMatch(/^td:/);

            // Total cache should have entries from both
            const totalStats = getCacheStats();
            expect(totalStats.size).toBeGreaterThanOrEqual(2);
        });

        it("clearDexieCache does not affect mangoCompile cache", () => {
            clearAllMangoCache();

            const docs: Doc[] = [{ id: 1, a: 1 }];
            const table = new FakeTable(docs);
            const selector = { a: 1 };

            // Populate both caches
            mangoCompile(selector);
            mangoToDexie(table as any, { selector } as any);

            expect(getMangoCacheStats().size).toBe(1);
            expect(getDexieCacheStats().size).toBe(1);

            // Clear only Dexie cache
            clearDexieCache();

            // mangoCompile cache should be unaffected
            expect(getMangoCacheStats().size).toBe(1);
            expect(getDexieCacheStats().size).toBe(0);
        });

        it("clearMangoCache does not affect Dexie cache", () => {
            clearAllMangoCache();

            const docs: Doc[] = [{ id: 1, a: 1 }];
            const table = new FakeTable(docs);
            const selector = { a: 1 };

            // Populate both caches
            mangoCompile(selector);
            mangoToDexie(table as any, { selector } as any);

            expect(getMangoCacheStats().size).toBe(1);
            expect(getDexieCacheStats().size).toBe(1);

            // Clear only mangoCompile cache
            clearMangoCache();

            // Dexie cache should be unaffected
            expect(getMangoCacheStats().size).toBe(0);
            expect(getDexieCacheStats().size).toBe(1);
        });

        it("clearAllMangoCache clears all caches", () => {
            clearAllMangoCache();

            const docs: Doc[] = [{ id: 1, a: 1 }];
            const table = new FakeTable(docs);
            const selector = { a: 1 };

            // Populate both caches
            mangoCompile(selector);
            mangoToDexie(table as any, { selector } as any);

            expect(getCacheStats().size).toBeGreaterThanOrEqual(2);

            // Clear all
            clearAllMangoCache();

            expect(getCacheStats().size).toBe(0);
            expect(getMangoCacheStats().size).toBe(0);
            expect(getDexieCacheStats().size).toBe(0);
        });
    });
});
