import v21 from "./v21";
import { AclPermission, DocType } from "../../enums";

describe("v21 — Share ACL backfill", () => {
    function mockDb(version: number, groups: any[]) {
        const inserted: any[] = [];
        const db = {
            getSchemaVersion: jest.fn().mockResolvedValue(version),
            setSchemaVersion: jest.fn().mockResolvedValue(undefined),
            processAllDocs: jest.fn(async (_types: DocType[], cb: (doc: any) => Promise<void>) => {
                for (const g of groups) await cb(g);
            }),
            insertDoc: jest.fn(async (doc: any) => {
                inserted.push(doc);
            }),
        } as any;
        return { db, inserted };
    }

    function entry(type: DocType, permission: AclPermission[], groupId = "g") {
        return { type, groupId, permission };
    }

    function group(id: string, acl: any[]) {
        return { _id: id, type: DocType.Group, acl };
    }

    it.each([DocType.Post, DocType.Tag])(
        "grants Share on a %s entry holding View",
        async (type) => {
            const g = group("group-public-content", [entry(type, [AclPermission.View])]);
            const { db, inserted } = mockDb(20, [g]);

            await v21(db);

            expect(inserted).toHaveLength(1);
            expect(inserted[0].acl[0].permission).toContain(AclPermission.Share);
            expect(inserted[0].acl[0].permission).toContain(AclPermission.View);
            expect(db.setSchemaVersion).toHaveBeenCalledWith(21);
        },
    );

    it("leaves entries without View untouched", async () => {
        const g = group("group-public-editors", [
            entry(DocType.Post, [AclPermission.CmsView, AclPermission.Edit]),
        ]);
        const { db, inserted } = mockDb(20, [g]);

        await v21(db);

        expect(inserted).toHaveLength(0);
        expect(g.acl[0].permission).not.toContain(AclPermission.Share);
        expect(db.setSchemaVersion).toHaveBeenCalledWith(21);
    });

    it("leaves non-shareable doc types untouched", async () => {
        const g = group("group-public-users", [
            entry(DocType.Language, [AclPermission.View]),
            entry(DocType.Redirect, [AclPermission.View]),
            entry(DocType.Storage, [AclPermission.View]),
        ]);
        const { db, inserted } = mockDb(20, [g]);

        await v21(db);

        expect(inserted).toHaveLength(0);
        for (const e of g.acl) expect(e.permission).not.toContain(AclPermission.Share);
    });

    it("backfills only the qualifying entries of a mixed group", async () => {
        const g = group("group-private-content", [
            entry(DocType.Post, [AclPermission.View, AclPermission.Publish]),
            entry(DocType.Language, [AclPermission.View]),
        ]);
        const { db, inserted } = mockDb(20, [g]);

        await v21(db);

        expect(inserted).toHaveLength(1);
        const post = inserted[0].acl.find((e: any) => e.type === DocType.Post);
        const language = inserted[0].acl.find((e: any) => e.type === DocType.Language);
        expect(post.permission).toContain(AclPermission.Share);
        expect(language.permission).not.toContain(AclPermission.Share);
    });

    it("is idempotent for entries that already hold Share", async () => {
        const g = group("group-public-content", [
            entry(DocType.Tag, [AclPermission.View, AclPermission.Share]),
        ]);
        const { db, inserted } = mockDb(20, [g]);

        await v21(db);

        expect(inserted).toHaveLength(0);
        expect(g.acl[0].permission).toEqual([AclPermission.View, AclPermission.Share]);
    });

    it("skips groups with a malformed acl", async () => {
        const { db, inserted } = mockDb(20, [
            { _id: "no-acl", type: DocType.Group },
            group("bad-permission", [{ type: DocType.Post, groupId: "g" }]),
        ]);

        await v21(db);

        expect(inserted).toHaveLength(0);
        expect(db.setSchemaVersion).toHaveBeenCalledWith(21);
    });

    it.each([19, 21])("does not run when the schema version is %s", async (version) => {
        const g = group("group-public-content", [entry(DocType.Post, [AclPermission.View])]);
        const { db, inserted } = mockDb(version, [g]);

        await v21(db);

        expect(inserted).toHaveLength(0);
        expect(db.processAllDocs).not.toHaveBeenCalled();
        expect(db.setSchemaVersion).not.toHaveBeenCalled();
    });

    it("re-throws and leaves the version alone when a write fails", async () => {
        const g = group("group-public-content", [entry(DocType.Post, [AclPermission.View])]);
        const { db } = mockDb(20, [g]);
        db.insertDoc = jest.fn().mockRejectedValue(new Error("write failed"));

        await expect(v21(db)).rejects.toThrow("write failed");
        expect(db.setSchemaVersion).not.toHaveBeenCalled();
    });
});
