import "fake-indexeddb/auto";
import { describe, it, afterEach, expect, beforeAll } from "vitest";
import { mockPostDto } from "../tests/mockdata";
import { DocType, type BaseDocumentDto } from "../types";
import { db, initDatabase } from "./database";
import { initConfig } from "../config";

// No real doc type owns a table yet, so the test adds one named like a doc type.
const NOTE = "note";

const note = {
    _id: "note-1",
    type: NOTE,
    updatedTimeUtc: 1,
} as unknown as BaseDocumentDto;

describe("doc type table routing", () => {
    beforeAll(async () => {
        initConfig({ cms: false, docsIndex: "", apiUrl: "http://localhost:12345" });
        await initDatabase();

        db.close();
        db.version(db.verno + 1).stores({ [NOTE]: "_id, type, updatedTimeUtc" });
        await db.open();
    });

    afterEach(async () => {
        await db.table(NOTE).clear();
    });

    it("routes a doc type to the table of the same name, and anything else to docs", () => {
        expect(db.tableFor(NOTE).name).toBe(NOTE);
        expect(db.tableFor(DocType.Post).name).toBe("docs");
        expect(db.tableFor(undefined).name).toBe("docs");
    });

    it("bulkPut lands each doc of a mixed batch in its own table", async () => {
        const post = { ...mockPostDto, _id: "post-route", updatedTimeUtc: 2 };
        await db.bulkPut([post, note]);

        expect(await db.table(NOTE).get(note._id)).toMatchObject({ type: NOTE });
        expect(await db.docs.get(note._id)).toBeUndefined();
        expect(await db.docs.get(post._id)).toBeDefined();
    });

    it("upsert writes to the routed table and still queues the change", async () => {
        await db.upsert({ doc: note });

        expect(await db.table(NOTE).get(note._id)).toBeDefined();
        expect(await db.docs.get(note._id)).toBeUndefined();
        expect(await db.localChanges.where({ docId: note._id }).count()).toBe(1);
    });

    it("get reads from the routed table when given the type", async () => {
        await db.table(NOTE).put(note);

        expect(await db.get(note._id, NOTE as DocType)).toMatchObject(note);
    });

    it("purge keeps a routed table it does not name", async () => {
        await db.table(NOTE).put(note);
        await db.purge();

        expect(await db.table(NOTE).get(note._id)).toBeDefined();
    });
});
