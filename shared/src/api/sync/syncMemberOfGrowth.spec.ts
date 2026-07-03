import { describe, it, expect, beforeEach, vi } from "vitest";
import { initSync, sync, setCancelSync } from "./sync";
import { syncList } from "./state";
import { DocType, BaseDocumentDto } from "../../types";

// Same faithful end-to-end harness as syncDualColumn.spec.ts: mock only the DB; syncBatch/merge/
// utils/trim run for real against a CouchDB-like /query mock.
vi.mock("../../db/database", () => ({
    db: {
        getSyncList: vi.fn(async () => {}),
        setSyncList: vi.fn(async () => {}),
        deleteExpired: vi.fn(async () => {}),
        bulkPut: vi.fn(async () => {}),
    },
}));
import { db } from "../../db/database";

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
                    (d as any).updatedTimeUtc <= $lte &&
                    (d as any).updatedTimeUtc >= $gte &&
                    (d as any).memberOf.some((g: string) => groups.includes(g)),
            )
            .sort((a, b) => (b as any).updatedTimeUtc - (a as any).updatedTimeUtc);
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

// History across three groups, DISTINCT interleaved timestamps (real docs never collide on
// updatedTimeUtc the way a same-ts corpus would, which would stall the walk artificially).
// g1: 1000,4000,7000,10000,13000 ; g2: 2000,5000,8000,11000,14000 ; g3: 3000,6000,9000,12000,15000
function corpus(): BaseDocumentDto[] {
    const docs: BaseDocumentDto[] = [];
    const bases: Record<string, number> = { g1: 1000, g2: 2000, g3: 3000 };
    for (const g of ["g1", "g2", "g3"]) {
        for (let i = 0; i < 5; i++) {
            const ts = bases[g] + i * 3000;
            docs.push(postDoc(`${g}-${ts}`, ts, [g]));
        }
    }
    return docs;
}

const ALL_G2_G3 = corpus()
    .filter((d) => (d as any).memberOf[0] !== "g1")
    .map((d) => (d as any).id);

// What this guards: the access-GAIN side of the sync engine. When a column's memberOf grows
// (newly accessible groups), the engine must walk the added groups to full depth, not just the
// head. This is the complement of `deleteRevoked`'s syncList reconciliation (the access-LOSS side,
// db/database.ts): after a partial revoke trims a column to its surviving groups, a later re-grant
// of the dropped group arrives here as a memberOf growth and must fully re-sync. The "one post /
// one tag" partial-sync bug (#160) was NOT this path — it was the loss side leaving a stale `eof`
// column (covered in db/database.spec.ts "revoked syncList reconciliation"); these tests pin that
// the gain path itself stays correct so the two halves compose.
describe("memberOf growth — newly accessible groups must fully sync (gain-side regression)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        syncList.value = [];
        setCancelSync(false);
    });

    it("deep [g1] then grow to [g1,g2,g3]: g2/g3 full history syncs", async () => {
        const { post } = makeCouchMock(corpus());
        initSync({ post } as any);

        await sync({ type: DocType.Post, memberOf: ["g1"], limit: 3, includeDeleteCmds: false });
        await sync({
            type: DocType.Post,
            memberOf: ["g1", "g2", "g3"],
            limit: 3,
            includeDeleteCmds: false,
        });

        const ids = syncedIds();
        for (const id of ALL_G2_G3) expect(ids.has(id)).toBe(true);
    });

    it("shallow head-only [g1] column then grow to [g1,g2,g3]: g2/g3 full history syncs", async () => {
        const { post } = makeCouchMock(corpus());
        initSync({ post } as any);

        // Simulate the immediate sync (stale/partial accessMap) having left a SHALLOW [g1] column:
        // eof:true but covering only the ~syncTolerance head window (5000-4000), not the full history.
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["g1"],
                blockStart: 13000,
                blockEnd: 12000,
                eof: true,
                publishDateMin: undefined,
                publishDateMax: undefined,
            } as any,
        ];

        await sync({
            type: DocType.Post,
            memberOf: ["g1", "g2", "g3"],
            limit: 3,
            includeDeleteCmds: false,
        });

        const ids = syncedIds();
        for (const id of ALL_G2_G3) expect(ids.has(id)).toBe(true);
    });
});
