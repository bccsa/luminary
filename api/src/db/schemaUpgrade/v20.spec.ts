import v20 from "./v20";
import { AclPermission, DocType } from "../../enums";

describe("v20 — CmsView implication backfill", () => {
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

    it.each([
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Assign,
        AclPermission.Translate,
        AclPermission.Publish,
    ])("grants CmsView to an entry holding %s", async (permission) => {
        const g = group("group-public-editors", [
            entry(DocType.Tag, [AclPermission.View, permission]),
        ]);
        const { db, inserted } = mockDb(19, [g]);

        await v20(db);

        expect(inserted).toHaveLength(1);
        expect(inserted[0].acl[0].permission).toContain(AclPermission.CmsView);
        expect(inserted[0].acl[0].permission).toContain(AclPermission.View);
        expect(db.setSchemaVersion).toHaveBeenCalledWith(20);
    });

    it("leaves View-only entries untouched", async () => {
        const g = group("group-public-content", [
            entry(DocType.Post, [AclPermission.View]),
            entry(DocType.Tag, [AclPermission.View]),
        ]);
        const { db, inserted } = mockDb(19, [g]);

        await v20(db);

        expect(inserted).toHaveLength(0);
        for (const e of g.acl) expect(e.permission).not.toContain(AclPermission.CmsView);
        expect(db.setSchemaVersion).toHaveBeenCalledWith(20);
    });

    it("backfills only the qualifying entries of a mixed group", async () => {
        const g = group("group-private-editors", [
            entry(DocType.Post, [AclPermission.View, AclPermission.Publish]),
            entry(DocType.Redirect, [AclPermission.View]),
        ]);
        const { db, inserted } = mockDb(19, [g]);

        await v20(db);

        expect(inserted).toHaveLength(1);
        const post = inserted[0].acl.find((e: any) => e.type === DocType.Post);
        const redirect = inserted[0].acl.find((e: any) => e.type === DocType.Redirect);
        expect(post.permission).toContain(AclPermission.CmsView);
        expect(redirect.permission).not.toContain(AclPermission.CmsView);
    });

    it("skips entries granting group-public-users", async () => {
        const g = group("group-public-content", [
            entry(
                DocType.Post,
                [AclPermission.View, AclPermission.Edit, AclPermission.Publish],
                "group-public-users",
            ),
            entry(
                DocType.AuthProvider,
                [AclPermission.View, AclPermission.CmsView],
                "group-public-users",
            ),
        ]);
        const { db, inserted } = mockDb(19, [g]);

        await v20(db);

        expect(inserted).toHaveLength(0);
        const post = g.acl.find((e: any) => e.type === DocType.Post);
        expect(post.permission).not.toContain(AclPermission.CmsView);
    });

    // The grantee decides, not the group the entry lives in: the Public Users group doc holds the
    // super admins' grants over that group, which must stay visible in the CMS.
    it("backfills entries inside the group-public-users doc that grant another group", async () => {
        const g = group("group-public-users", [
            entry(
                DocType.Group,
                [AclPermission.View, AclPermission.Edit, AclPermission.Assign],
                "group-super-admins",
            ),
            entry(DocType.Post, [AclPermission.View], "group-public-users"),
        ]);
        const { db, inserted } = mockDb(19, [g]);

        await v20(db);

        expect(inserted).toHaveLength(1);
        const superAdmins = inserted[0].acl.find((e: any) => e.groupId === "group-super-admins");
        const publicUsers = inserted[0].acl.find((e: any) => e.groupId === "group-public-users");
        expect(superAdmins.permission).toContain(AclPermission.CmsView);
        expect(publicUsers.permission).not.toContain(AclPermission.CmsView);
    });

    it("is idempotent — does not re-add CmsView already present", async () => {
        const g = group("group-public-editors", [
            entry(DocType.Post, [AclPermission.View, AclPermission.Edit, AclPermission.CmsView]),
        ]);
        const { db, inserted } = mockDb(19, [g]);

        await v20(db);

        expect(inserted).toHaveLength(0);
        expect(
            g.acl[0].permission.filter((p: AclPermission) => p === AclPermission.CmsView),
        ).toHaveLength(1);
    });

    it("is a no-op when the schema version is not 19", async () => {
        const g = group("group-public-editors", [entry(DocType.Post, [AclPermission.Edit])]);
        const { db, inserted } = mockDb(18, [g]);

        await v20(db);

        expect(db.processAllDocs).not.toHaveBeenCalled();
        expect(db.setSchemaVersion).not.toHaveBeenCalled();
        expect(inserted).toHaveLength(0);
    });
});
