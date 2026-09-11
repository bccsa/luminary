import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import Dexie, { type Table } from "dexie";
import { mangoToDexie, clearDexieCache } from "./mangoToDexie";
import { mangoCompile } from "./mangoCompile";
import type { MangoQuery } from "./MangoTypes";

type Doc = {
    _id: string;
    type: string;
    status: string;
    parentId: string;
    parentType?: string;
    publishDate?: number;
    visible?: boolean;
};

class TestDb extends Dexie {
    docs!: Table<Doc, string>;
    constructor() {
        super("mangoToDexie-keyLookup");
        this.version(1).stores({
            docs: "_id, type, parentId, publishDate, [type+status], [type+parentId+status], [type+parentType+status]",
        });
    }
}

const db = new TestDb();

/** What any correct plan must return: filter everything, then order like an index walk. */
function expected(docs: Doc[], query: MangoQuery): string[] {
    const pred = mangoCompile(query.selector) as (d: unknown) => boolean;
    let out = docs.filter(pred);
    const sort = query.$sort?.[0];
    if (sort) {
        const [field, dir] = Object.entries(sort)[0] as [keyof Doc, string];
        out = out
            .filter((d) => d[field] != null)
            .sort((a, b) => ((a[field] as number) - (b[field] as number)) || (a._id < b._id ? -1 : 1));
        if (dir === "desc") out.reverse();
    }
    if (typeof query.$limit === "number") out = out.slice(0, query.$limit);
    return out.map((d) => d._id);
}

describe("mangoToDexie key lookups", () => {
    const docs: Doc[] = [];
    // 200 published posts spread over 20 parents, plus drafts and a doc without a publish date.
    for (let i = 0; i < 200; i++) {
        docs.push({
            _id: `c${String(i).padStart(3, "0")}`,
            type: "content",
            status: i % 10 === 0 ? "draft" : "published",
            parentId: `p${i % 20}`,
            parentType: i % 2 ? "post" : "tag",
            publishDate: 1000 + (i % 50),
            visible: i % 3 !== 0,
        });
    }
    docs.push({ _id: "c-undated", type: "content", status: "published", parentId: "p1" });

    beforeAll(async () => {
        await db.docs.bulkPut(docs);
    });

    beforeEach(() => clearDexieCache());
    afterEach(() => vi.restoreAllMocks());

    it("reads a primary-key $in directly even when equality fields are present", async () => {
        const bulkGet = vi.spyOn(db.docs, "bulkGet");
        const where = vi.spyOn(db.docs, "where");
        const query: MangoQuery = {
            selector: {
                type: "content",
                status: "published",
                _id: { $in: ["c001", "c010", "c011", "missing"] },
            },
        };

        const res = (await mangoToDexie(db.docs, query)) as Doc[];

        expect(bulkGet).toHaveBeenCalledWith(["c001", "c010", "c011", "missing"]);
        expect(where).not.toHaveBeenCalled();
        expect(res.map((d) => d._id).sort()).toEqual(expected(docs, query).sort());
    });

    it("walks a compound index covering the equality fields and the $in field", async () => {
        const where = vi.spyOn(db.docs, "where");
        const query: MangoQuery = {
            selector: {
                type: "content",
                status: "published",
                parentId: { $in: ["p1", "p2"] },
                visible: true,
            },
        };

        const res = (await mangoToDexie(db.docs, query)) as Doc[];

        expect(where).toHaveBeenCalledWith("[type+parentId+status]");
        expect(res.map((d) => d._id).sort()).toEqual(expected(docs, query).sort());
    });

    it("keeps the equality index when no compound index covers every field", async () => {
        const where = vi.spyOn(db.docs, "where");
        const query: MangoQuery = {
            selector: {
                type: "content",
                status: "published",
                parentType: "post",
                parentId: { $in: ["p1", "p3"] },
            },
        };

        const res = (await mangoToDexie(db.docs, query)) as Doc[];

        expect(where).not.toHaveBeenCalledWith("[type+parentId+status]");
        expect(res.map((d) => d._id).sort()).toEqual(expected(docs, query).sort());
    });

    it("uses the key lookup for a sorted, limited query when few rows are keyed", async () => {
        const orderBy = vi.spyOn(db.docs, "orderBy");
        const query: MangoQuery = {
            selector: { type: "content", status: "published", parentId: { $in: ["p1"] } },
            $sort: [{ publishDate: "desc" }],
            $limit: 5,
        };

        const res = (await mangoToDexie(db.docs, query)) as Doc[];

        expect(orderBy).not.toHaveBeenCalled();
        // Index order: undated rows left out, ties on publishDate in reverse primary-key order.
        expect(res.map((d) => d._id)).toEqual(expected(docs, query));
    });

    it("walks the sort index when most rows are keyed", async () => {
        const orderBy = vi.spyOn(db.docs, "orderBy");
        const parents = Array.from({ length: 20 }, (_, i) => `p${i}`);
        const query: MangoQuery = {
            selector: { type: "content", status: "published", parentId: { $in: parents } },
            $sort: [{ publishDate: "desc" }],
            $limit: 5,
        };

        const res = (await mangoToDexie(db.docs, query)) as Doc[];

        expect(orderBy).toHaveBeenCalledWith("publishDate");
        expect(res.map((d) => d._id)).toEqual(expected(docs, query));
    });

    it("reads an exact equality index for a sorted, limited query with few matches", async () => {
        const orderBy = vi.spyOn(db.docs, "orderBy");
        const query: MangoQuery = {
            selector: { type: "content", parentId: "not-stored", status: "published" },
            $sort: [{ publishDate: "desc" }],
            $limit: 1,
        };

        const res = (await mangoToDexie(db.docs, query)) as Doc[];

        expect(orderBy).not.toHaveBeenCalled();
        expect(res).toEqual([]);
    });

    it("walks the sort index when the equality range holds most rows", async () => {
        const orderBy = vi.spyOn(db.docs, "orderBy");
        const query: MangoQuery = {
            selector: { type: "content", status: "published" },
            $sort: [{ publishDate: "desc" }],
            $limit: 3,
        };

        const res = (await mangoToDexie(db.docs, query)) as Doc[];

        expect(orderBy).toHaveBeenCalledWith("publishDate");
        expect(res.map((d) => d._id)).toEqual(expected(docs, query));
    });

    it("sorts a keyed lookup without a limit", async () => {
        const query: MangoQuery = {
            selector: { type: "content", status: "published", parentId: { $in: ["p4", "p5"] } },
            $sort: [{ publishDate: "asc" }],
        };

        const res = (await mangoToDexie(db.docs, query)) as Doc[];

        expect(res.map((d) => d.publishDate)).toEqual(
            [...res.map((d) => d.publishDate)].sort((a, b) => a! - b!),
        );
        expect(res.map((d) => d._id).sort()).toEqual(expected(docs, query).sort());
    });
});
