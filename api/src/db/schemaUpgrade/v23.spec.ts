import v23 from "./v23";
import { DocType } from "../../enums";

describe("v23 — tagged documents cache rebuild", () => {
    function mockDb(version: number, docs: any[], tagged: Record<string, string[]>) {
        const upserted: any[] = [];
        const byId = (id: string) => docs.filter((d) => d._id === id);
        const db = {
            getSchemaVersion: jest.fn().mockResolvedValue(version),
            setSchemaVersion: jest.fn().mockResolvedValue(undefined),
            processAllDocs: jest.fn(async (types: DocType[], cb: (doc: any) => void) => {
                for (const d of docs.filter((d) => types.includes(d.type))) await cb(d);
            }),
            getTaggedDocIds: jest.fn(
                async (ids: string[]) => new Map(ids.map((id) => [id, tagged[id] ?? []])),
            ),
            getDoc: jest.fn(async (id: string) => ({ docs: byId(id) })),
            getContentByParentId: jest.fn(async (id: string) => ({
                docs: docs.filter((d) => d.type === DocType.Content && d.parentId === id),
            })),
            upsertDoc: jest.fn(async (doc: any) => {
                upserted.push(doc);
            }),
        } as any;
        return { db, upserted };
    }

    const tag = (id: string, taggedDocs?: string[]) => ({ _id: id, type: DocType.Tag, taggedDocs });
    const content = (id: string, parentId: string, parentTaggedDocs?: string[]) => ({
        _id: id,
        type: DocType.Content,
        parentId,
        parentTaggedDocs,
    });

    it("rebuilds a stale tag and its content from the tagged documents", async () => {
        const { db, upserted } = mockDb(
            22,
            [tag("cat", ["post-1"]), content("cat-eng", "cat", ["post-1"])],
            { cat: ["post-1", "post-2"] },
        );

        await v23(db);

        expect(upserted.map((d) => d._id)).toEqual(["cat", "cat-eng"]);
        expect(upserted[0].taggedDocs).toEqual(["post-1", "post-2"]);
        expect(upserted[1].parentTaggedDocs).toEqual(["post-1", "post-2"]);
        expect(db.setSchemaVersion).toHaveBeenCalledWith(23);
    });

    it("drops entries for documents that are no longer tagged", async () => {
        const { db, upserted } = mockDb(22, [tag("cat", ["post-gone"])], { cat: [] });

        await v23(db);

        expect(upserted[0].taggedDocs).toEqual([]);
    });

    it("leaves an up-to-date cache untouched, whatever its order", async () => {
        const { db, upserted } = mockDb(
            22,
            [tag("cat", ["post-2", "post-1"]), content("cat-eng", "cat", ["post-1", "post-2"])],
            { cat: ["post-1", "post-2"] },
        );

        await v23(db);

        expect(upserted).toEqual([]);
        expect(db.setSchemaVersion).toHaveBeenCalledWith(23);
    });

    it("is a no-op unless the database is at version 22", async () => {
        const { db, upserted } = mockDb(23, [tag("cat", [])], { cat: ["post-1"] });

        await v23(db);

        expect(upserted).toEqual([]);
        expect(db.setSchemaVersion).not.toHaveBeenCalled();
    });
});
