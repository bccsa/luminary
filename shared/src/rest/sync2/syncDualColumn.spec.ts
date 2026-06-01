import { describe, it, expect, beforeEach, vi } from "vitest";
import { initSync, sync, setCancelSync } from "./sync";
import { syncList } from "./state";
import { DocType, BaseDocumentDto } from "../../types";

// Mock only the database layer. syncBatch / merge / utils / trim run for real so these are true
// end-to-end tests of the sync engine against a faithful CouchDB-like API mock.
vi.mock("../../db/database", () => ({
    db: {
        getSyncList: vi.fn(async () => {}),
        setSyncList: vi.fn(async () => {}),
        deleteExpired: vi.fn(async () => {}),
        bulkPut: vi.fn(async () => {}),
    },
}));
import { db } from "../../db/database";

/**
 * Faithful enough mock of the /query endpoint: honours selector.type, the inclusive
 * updatedTimeUtc.$lte/$gte range, memberOf.$elemMatch.$in, sorts by updatedTimeUtc DESC (single key,
 * no tiebreaker — as the real sync index does) and applies limit after sorting.
 */
function makeCouchMock(corpus: BaseDocumentDto[]) {
    const calls: any[] = [];
    const post = vi.fn(async (_path: string, body: any) => {
        calls.push(body);
        const sel = body.selector;
        const { $lte, $gte } = sel.updatedTimeUtc;
        const groups: string[] = sel.memberOf.$elemMatch.$in;
        const matched = corpus
            .filter(
                (d) =>
                    d.type === sel.type &&
                    d.updatedTimeUtc <= $lte &&
                    d.updatedTimeUtc >= $gte &&
                    (d as any).memberOf.some((g: string) => groups.includes(g)),
            )
            .sort((a, b) => b.updatedTimeUtc - a.updatedTimeUtc);
        return { docs: matched.slice(0, body.limit) };
    });
    return { post, calls };
}

function syncedIds(): Set<string> {
    const ids = new Set<string>();
    for (const call of (db.bulkPut as any).mock.calls) {
        for (const doc of call[0] as BaseDocumentDto[]) ids.add((doc as any).id);
    }
    return ids;
}

function postDoc(id: string, ts: number, memberOf: string[]): BaseDocumentDto {
    return { id, type: DocType.Post, updatedTimeUtc: ts, memberOf } as any;
}

describe("dual-column lockout + incomplete-column completion (Phase 1)", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        syncList.value = [];
        setCancelSync(false);
    });

    it("resolves the nested dual-column lockout: new content syncs and the columns collapse in one pass", async () => {
        const FULL = ["g1", "g2", "g3", "g4"];
        const SUBSET = ["g1", "g2"];

        const corpus = [
            postDoc("A", 6000, ["g3"]), // NEW content for a full-only group (the lockout victim)
            postDoc("B", 5500, ["g1"]), // NEW content for a subset group
            postDoc("C", 5000, ["g1"]), // boundary at both columns' blockStart
            postDoc("D", 2000, ["g1"]), // boundary at the subset column's blockEnd
            postDoc("E", 1000, ["g1"]), // older subset content never reached (incomplete)
            postDoc("F", 500, ["g1"]),
        ];

        // The reported state: a complete full-set column + an incomplete strict-subset column.
        syncList.value = [
            { chunkType: "post", memberOf: FULL, blockStart: 5000, blockEnd: 0, eof: true },
            { chunkType: "post", memberOf: SUBSET, blockStart: 5000, blockEnd: 2000, eof: false },
        ];

        const http = makeCouchMock(corpus);
        await initSync(http as any);

        // Pre-fix this call recurses forever and never reaches syncBatch; it must now terminate.
        await sync({ type: DocType.Post, memberOf: FULL, limit: 100, includeDeleteCmds: false });

        const got = syncedIds();
        // Lockout fixed: new content for the full-only group is fetched.
        expect(got.has("A")).toBe(true);
        // Incomplete subset column was driven down past its old blockEnd (2000) to the bottom.
        expect(got.has("E")).toBe(true);
        expect(got.has("F")).toBe(true);

        // The dual-column has collapsed into a single complete full-set column.
        const postCols = syncList.value.filter((c) => c.chunkType === "post");
        expect(postCols).toHaveLength(1);
        expect(postCols[0].eof).toBe(true);
        expect(postCols[0].blockEnd).toBe(0);
        expect([...postCols[0].memberOf].sort()).toEqual(FULL);
    });

    it("does not prematurely mark an incomplete column EOF from a catch-up window (< limit new docs)", async () => {
        const GROUPS = ["g1"];

        // No content newer than the column's blockStart, so the catch-up window (floor 5000-1000)
        // returns only the boundary doc (< limit). Pre-fix, that catch-up chunk's eof:true is
        // inherited by the merge and falsely seals the column at blockEnd 3000 — the older docs
        // below are never fetched. The decoupling fix keeps eof:false until the downward walk
        // reaches the bottom (floor 0).
        const corpus = [
            postDoc("top", 5000, GROUPS), // boundary at blockStart (newest doc overall)
            postDoc("mid", 3000, GROUPS), // boundary at blockEnd
            postDoc("old1", 2000, GROUPS), // below blockEnd — only reachable by downward continuation
            postDoc("old2", 1000, GROUPS),
        ];

        syncList.value = [
            { chunkType: "post", memberOf: GROUPS, blockStart: 5000, blockEnd: 3000, eof: false },
        ];

        const http = makeCouchMock(corpus);
        await initSync(http as any);

        await sync({ type: DocType.Post, memberOf: GROUPS, limit: 100, includeDeleteCmds: false });

        const got = syncedIds();
        // The downward continuation ran to the bottom and fetched the older docs.
        expect(got.has("old1")).toBe(true);
        expect(got.has("old2")).toBe(true);

        // The column reached a genuine EOF at the bottom of the timeline.
        const cols = syncList.value.filter((c) => c.chunkType === "post");
        expect(cols).toHaveLength(1);
        expect(cols[0].eof).toBe(true);
        expect(cols[0].blockEnd).toBe(0);
    });
});

describe("initSync relational self-heal (Phase 2)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        syncList.value = [];
        setCancelSync(false);
    });

    it("resets a chunkType (and its deleteCmd sibling) that holds duplicate memberOf+languages columns", async () => {
        syncList.value = [
            // Two "post" columns with identical memberOf + languages — a genuine duplicate.
            { chunkType: "post", memberOf: ["g1", "g2"], blockStart: 5000, blockEnd: 0, eof: true },
            {
                chunkType: "post",
                memberOf: ["g1", "g2"],
                blockStart: 4000,
                blockEnd: 2000,
                eof: false,
            },
            // The paired deleteCmd column — should be reset together with "post".
            {
                chunkType: "deleteCmd:post",
                memberOf: ["g1", "g2"],
                blockStart: 5000,
                blockEnd: 0,
                eof: true,
            },
            // A healthy, unrelated chunkType — must be left untouched.
            { chunkType: "tag", memberOf: ["g1"], blockStart: 5000, blockEnd: 0, eof: true },
        ];

        const http = makeCouchMock([]);
        await initSync(http as any);

        const types = syncList.value.map((e) => e.chunkType);
        expect(types).not.toContain("post");
        expect(types).not.toContain("deleteCmd:post");
        expect(types).toContain("tag");
        expect(db.setSyncList).toHaveBeenCalled();
    });

    it("leaves a healthy subset/superset dual-column untouched (Phase 1 resolves it, not a reset)", async () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["g1", "g2", "g3"],
                blockStart: 5000,
                blockEnd: 0,
                eof: true,
            },
            { chunkType: "post", memberOf: ["g1", "g2"], blockStart: 5000, blockEnd: 2000, eof: false },
        ];

        const http = makeCouchMock([]);
        await initSync(http as any);

        // Not flagged as degenerate — both columns remain.
        expect(syncList.value).toHaveLength(2);
        expect(db.setSyncList).not.toHaveBeenCalled();
    });
});
