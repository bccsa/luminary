import v24 from "./v24";
import { DocType } from "../../enums";

describe("v24 — content parentMediaBucketId re-stamp", () => {
    function mockDb(version: number, docs: any[]) {
        const upserted: any[] = [];
        const db = {
            getSchemaVersion: jest.fn().mockResolvedValue(version),
            setSchemaVersion: jest.fn().mockResolvedValue(undefined),
            processAllDocs: jest.fn(async (types: DocType[], cb: (doc: any) => void) => {
                for (const d of docs.filter((d) => types.includes(d.type))) await cb(d);
            }),
            getDoc: jest.fn(async (id: string) => ({ docs: docs.filter((d) => d._id === id) })),
            getContentByParentId: jest.fn(async (id: string) => ({
                docs: docs.filter((d) => d.type === DocType.Content && d.parentId === id),
            })),
            upsertDoc: jest.fn(async (doc: any) => {
                upserted.push(doc);
            }),
        } as any;
        return { db, upserted };
    }

    const post = (id: string, mediaBucketId?: string) => ({
        _id: id,
        type: DocType.Post,
        mediaBucketId,
    });
    const tag = (id: string, mediaBucketId?: string) => ({
        _id: id,
        type: DocType.Tag,
        mediaBucketId,
    });
    const content = (id: string, parentId: string, parentMediaBucketId?: string) => ({
        _id: id,
        type: DocType.Content,
        parentId,
        parentMediaBucketId,
    });

    it("stamps a missing or stale media bucket from the parent", async () => {
        const { db, upserted } = mockDb(23, [
            post("post-1", "bucket-a"),
            content("post-1-eng", "post-1"),
            content("post-1-fra", "post-1", "bucket-old"),
            tag("tag-1", "bucket-b"),
            content("tag-1-eng", "tag-1"),
        ]);

        await v24(db);

        expect(upserted.map((d) => [d._id, d.parentMediaBucketId])).toEqual([
            ["post-1-eng", "bucket-a"],
            ["post-1-fra", "bucket-a"],
            ["tag-1-eng", "bucket-b"],
        ]);
        expect(db.setSchemaVersion).toHaveBeenCalledWith(24);
    });

    it("clears a media bucket the parent no longer has", async () => {
        const { db, upserted } = mockDb(23, [
            post("post-1"),
            content("post-1-eng", "post-1", "bucket-old"),
        ]);

        await v24(db);

        expect(upserted).toHaveLength(1);
        expect(upserted[0].parentMediaBucketId).toBeUndefined();
    });

    it("leaves up-to-date content untouched", async () => {
        const { db, upserted } = mockDb(23, [
            post("post-1", "bucket-a"),
            content("post-1-eng", "post-1", "bucket-a"),
            post("post-2"),
            content("post-2-eng", "post-2"),
        ]);

        await v24(db);

        expect(upserted).toEqual([]);
        expect(db.setSchemaVersion).toHaveBeenCalledWith(24);
    });

    it("is a no-op unless the database is at version 23", async () => {
        const { db, upserted } = mockDb(24, [post("post-1", "bucket-a"), content("c", "post-1")]);

        await v24(db);

        expect(upserted).toEqual([]);
        expect(db.setSchemaVersion).not.toHaveBeenCalled();
    });
});
