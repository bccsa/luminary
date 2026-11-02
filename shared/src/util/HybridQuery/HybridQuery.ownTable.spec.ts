import "fake-indexeddb/auto";
import { describe, it, beforeAll, beforeEach, expect, vi } from "vitest";
import { effectScope } from "vue";
import waitForExpect from "wait-for-expect";

// Real db (fake-indexeddb): a doc type with a Dexie table of its own name is read from that
// table, served locally and never asked of the API.
import { db, initDatabase } from "../../db/database";
import { initConfig } from "../../config";
import { HybridQuery, initHybridQuery, queryLocal } from "./HybridQuery";
import type { BaseDocumentDto } from "../../types";

// No real doc type owns a table yet, so the test adds one named like a doc type.
const NOTE = "note";

const note = (id: string, updatedTimeUtc: number) =>
    ({ _id: `note-${id}`, type: NOTE, updatedTimeUtc }) as unknown as BaseDocumentDto;

const post = vi.fn();

describe("HybridQuery on a doc type with its own table", () => {
    beforeAll(async () => {
        initConfig({ cms: false, docsIndex: "", apiUrl: "http://localhost:12345" });
        await initDatabase();

        db.close();
        db.version(db.verno + 1).stores({ [NOTE]: "_id, type, updatedTimeUtc" });
        await db.open();

        initHybridQuery({ post } as any);
    });

    beforeEach(async () => {
        await db.table(NOTE).clear();
        post.mockReset();
    });

    it("queryLocal reads the routed table", async () => {
        await db.table(NOTE).bulkPut([note("1", 1), note("2", 2)]);

        const rows = await queryLocal({
            selector: { type: NOTE },
            $sort: [{ updatedTimeUtc: "desc" }],
        });

        expect(rows.map((r) => r._id)).toEqual(["note-2", "note-1"]);
    });

    it("a live query follows writes without calling the API", async () => {
        await db.table(NOTE).put(note("1", 1));

        const scope = effectScope();
        const q = scope.run(
            () =>
                new HybridQuery(
                    { selector: { type: NOTE, deleted: { $exists: false } } },
                    { live: true },
                ),
        )!;

        await waitForExpect(() => expect(q.output.value.map((r) => r._id)).toEqual(["note-1"]));

        await db.table(NOTE).put(note("2", 2));
        await waitForExpect(() => expect(q.output.value).toHaveLength(2));

        await db.table(NOTE).put({ ...note("1", 3), deleted: true });
        await waitForExpect(() => expect(q.output.value.map((r) => r._id)).toEqual(["note-2"]));

        expect(post).not.toHaveBeenCalled();
        scope.stop();
    });
});
