import { describe, it, expect } from "vitest";
import { mongoToDexie } from "./mongoToDexie";

type Doc = {
    id: number;
    a?: number;
    b?: string;
    c?: number;
    d?: number;
    age?: number;
    active?: boolean;
    status?: number;
    name?: string;
};

class FakeCollection<T> {
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
        return this.items;
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
}

class FakeTable<T extends Record<string, any>> {
    public lastWhereArg?: Record<string, any>;
    public lastWhereField?: string;
    public lastClauseOp?: string;
    constructor(public data: T[]) {}

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

describe("mongoToDexie", () => {
    it("pushes combined simple equalities (excluding booleans) via where({ ... })", () => {
        const docs: Doc[] = [
            { id: 1, a: 1, b: "x", c: 3, active: true },
            { id: 2, a: 1, b: "x", c: 3, active: false },
            { id: 3, a: 1, b: "y", c: 3, active: true },
            { id: 4, a: 2, b: "x", c: 3, active: true },
        ];
        const table = new FakeTable(docs);
        const query = { selector: { a: 1, b: "x", $and: [{ c: 3 }, { active: true }] } };
        const col: any = mongoToDexie(table as any, query as any);
        const res = col.toArray() as Doc[];

        expect(table.lastWhereArg).toEqual({ a: 1, b: "x", c: 3 });
        expect(res.map((d) => d.id)).toEqual([1]);
        expect(res.every((d) => d.active === true)).toBe(true);
    });

    it("prefers anyOf for $in and applies residual filters", () => {
        const docs: Doc[] = [
            { id: 1, a: 1, d: 4 },
            { id: 2, a: 1, d: 6 },
            { id: 3, a: 2, d: 10 },
            { id: 4, a: 3, d: 7 },
        ];
        const table = new FakeTable(docs);
        const query = { selector: { a: { $in: [1, 2] }, d: { $gt: 5 } } };
        const col: any = mongoToDexie(table as any, query as any);
        const res = col.toArray() as Doc[];

        expect(table.lastWhereField).toBe("a");
        expect(table.lastClauseOp).toBe("anyOf");
        expect(res.map((d) => d.id)).toEqual([2, 3]);
    });

    it("pushes single-field comparator when no eq/anyOf available", () => {
        const docs: Doc[] = [
            { id: 1, age: 20 },
            { id: 2, age: 30 },
            { id: 3, age: 40 },
        ];
        const table = new FakeTable(docs);
        const query = { selector: { age: { $gte: 30 } } };
        const col: any = mongoToDexie(table as any, query as any);
        const res = col.toArray() as Doc[];

        expect(table.lastWhereField).toBe("age");
        expect(table.lastClauseOp).toBe("aboveOrEqual");
        expect(res.map((d) => d.id)).toEqual([2, 3]);
    });

    it("uses sorting path with orderBy + reverse and then in-memory filter + limit", () => {
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
        const col: any = mongoToDexie(table as any, query as any);
        const res = col.toArray() as Doc[];

        expect(res.map((d) => d.id)).toEqual([2]);
    });

    it("never pushes boolean equalities to where()", () => {
        const docs: Doc[] = [
            { id: 1, name: "Alice", active: true },
            { id: 2, name: "Alice", active: false },
            { id: 3, name: "Bob", active: true },
        ];
        const table = new FakeTable(docs);
        const query = { selector: { name: "Alice", active: true } };
        const col: any = mongoToDexie(table as any, query as any);
        const res = col.toArray() as Doc[];

        expect(table.lastWhereArg).toEqual({ name: "Alice" });
        expect(res.map((d) => d.id)).toEqual([1]);
        expect(res.every((d) => d.active === true)).toBe(true);
    });

    it("removes $in from residual and keeps other ops on same field", () => {
        const docs: Doc[] = [
            { id: 1, status: 1 },
            { id: 2, status: 2 },
            { id: 3, status: 3 },
            { id: 4, status: 4 },
        ];
        const table = new FakeTable(docs);
        const query = { selector: { status: { $in: [1, 2, 3], $gte: 2 } } };
        const col: any = mongoToDexie(table as any, query as any);
        const res = col.toArray() as Doc[];

        expect(table.lastWhereField).toBe("status");
        expect(table.lastClauseOp).toBe("anyOf");
        expect(res.map((d) => d.id)).toEqual([2, 3]);
    });
});
