import v25 from "./v25";
import { DeleteReason, DocType, PublishStatus } from "../../enums";

describe("v25 — StatusChange deleteCmd reconciliation", () => {
    function mockDb(version: number, docs: any[]) {
        const deleted: string[] = [];
        const inserted: any[] = [];
        const db = {
            getSchemaVersion: jest.fn().mockResolvedValue(version),
            setSchemaVersion: jest.fn().mockResolvedValue(undefined),
            processAllDocs: jest.fn(async (types: DocType[], cb: (doc: any) => Promise<void>) => {
                for (const d of docs.filter((d) => types.includes(d.type))) await cb(d);
            }),
            getDoc: jest.fn(async (id: string) => ({ docs: docs.filter((d) => d._id === id) })),
            deleteDoc: jest.fn(async (id: string) => {
                deleted.push(id);
            }),
            insertDoc: jest.fn(async (doc: any) => {
                inserted.push(doc);
            }),
        } as any;
        return { db, deleted, inserted };
    }

    const cmd = (id: string, docId: string, updatedTimeUtc = 1000) => ({
        _id: id,
        type: DocType.DeleteCmd,
        docId,
        deleteReason: DeleteReason.StatusChange,
        updatedTimeUtc,
    });
    const content = (id: string, status: PublishStatus, statusChangeDeleteCmdId?: string) => ({
        _id: id,
        type: DocType.Content,
        status,
        statusChangeDeleteCmdId,
    });

    it("deletes the deleteCmd of content that was republished after its draft was saved again", async () => {
        const { db, deleted } = mockDb(24, [
            content("post-1-eng", PublishStatus.Published),
            cmd("cmd-orphan", "post-1-eng"),
        ]);

        await v25(db);

        expect(deleted).toEqual(["cmd-orphan"]);
        expect(db.setSchemaVersion).toHaveBeenCalledWith(25);
    });

    it("re-links the deleteCmd of a draft that lost its tracking field", async () => {
        const { db, deleted, inserted } = mockDb(24, [
            content("post-1-eng", PublishStatus.Draft),
            cmd("cmd-1", "post-1-eng"),
        ]);

        await v25(db);

        expect(deleted).toEqual([]);
        expect(inserted.map((d) => [d._id, d.statusChangeDeleteCmdId])).toEqual([
            ["post-1-eng", "cmd-1"],
        ]);
    });

    it("leaves a tracked draft and other deleteCmd reasons alone", async () => {
        const { db, deleted, inserted } = mockDb(24, [
            content("post-1-eng", PublishStatus.Draft, "cmd-1"),
            cmd("cmd-1", "post-1-eng"),
            { ...cmd("cmd-deleted", "post-2-eng"), deleteReason: DeleteReason.Deleted },
        ]);

        await v25(db);

        expect(deleted).toEqual([]);
        expect(inserted).toEqual([]);
    });

    it("keeps the newest of a draft's duplicate deleteCmds, not the first in _id order", async () => {
        // Unpublished (cmd-a), republished, unpublished again (cmd-b). The scan meets the
        // older cmd-a first, but a client that synced past it only drops the content on cmd-b.
        const { db, deleted, inserted } = mockDb(24, [
            content("post-1-eng", PublishStatus.Draft),
            cmd("cmd-a", "post-1-eng", 1000),
            cmd("cmd-b", "post-1-eng", 2000),
        ]);

        await v25(db);

        expect(deleted).toEqual(["cmd-a"]);
        expect(inserted.map((d) => [d._id, d.statusChangeDeleteCmdId])).toEqual([
            ["post-1-eng", "cmd-b"],
        ]);
    });

    it("moves a draft tracking an older deleteCmd to the newest one", async () => {
        const { db, deleted, inserted } = mockDb(24, [
            content("post-1-eng", PublishStatus.Draft, "cmd-old"),
            cmd("cmd-new", "post-1-eng", 2000),
            cmd("cmd-old", "post-1-eng", 1000),
        ]);

        await v25(db);

        expect(deleted).toEqual(["cmd-old"]);
        expect(inserted.map((d) => [d._id, d.statusChangeDeleteCmdId])).toEqual([
            ["post-1-eng", "cmd-new"],
        ]);
    });

    it("deletes every deleteCmd of content that no longer exists", async () => {
        const { db, deleted, inserted } = mockDb(24, [
            cmd("cmd-1", "post-gone-eng", 1000),
            cmd("cmd-2", "post-gone-eng", 2000),
        ]);

        await v25(db);

        expect(deleted.sort()).toEqual(["cmd-1", "cmd-2"]);
        expect(inserted).toEqual([]);
    });

    it("does nothing unless the schema is at version 24", async () => {
        const { db, deleted } = mockDb(25, [
            content("post-1-eng", PublishStatus.Published),
            cmd("cmd-orphan", "post-1-eng"),
        ]);

        await v25(db);

        expect(deleted).toEqual([]);
        expect(db.setSchemaVersion).not.toHaveBeenCalled();
    });
});
