import v19 from "./v19";
import { AclPermission, DocType } from "../../enums";

describe("v19 — CmsView ACL backfill", () => {
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

    it("grants CmsView to group-super-admins ACL entries in any target group", async () => {
        const superAdmins = group("group-super-admins", [
            entry(DocType.Post, [AclPermission.View, AclPermission.Edit], "group-super-admins"),
        ]);
        const publicUsers = group("group-public-users", [
            entry(DocType.User, [AclPermission.View], "group-super-admins"),
        ]);
        const privateUsers = group("group-private-users", [
            entry(DocType.Language, [AclPermission.View], "group-super-admins"),
        ]);
        const publicContent = group("group-public-content", [
            entry(DocType.Post, [AclPermission.View], "group-public-users"),
        ]);
        const { db, inserted } = mockDb(18, [
            superAdmins,
            publicUsers,
            privateUsers,
            publicContent,
        ]);

        await v19(db);

        expect(inserted).toEqual([superAdmins, publicUsers, privateUsers]);
        for (const g of [superAdmins, publicUsers, privateUsers]) {
            for (const e of g.acl) {
                expect(e.permission).toContain(AclPermission.CmsView);
            }
        }
        expect(publicContent.acl[0].permission).not.toContain(AclPermission.CmsView);
        expect(db.setSchemaVersion).toHaveBeenCalledWith(19);
    });

    it("grants CmsView to group-public-users only for AuthProvider entries", async () => {
        const g = group("group-public-users", [
            entry(DocType.Post, [AclPermission.View, AclPermission.Edit], "group-public-users"),
            entry(DocType.AuthProvider, [AclPermission.View], "group-public-users"),
        ]);
        const { db, inserted } = mockDb(18, [g]);

        await v19(db);

        expect(inserted).toHaveLength(1);
        const post = inserted[0].acl.find((e: any) => e.type === DocType.Post);
        const provider = inserted[0].acl.find((e: any) => e.type === DocType.AuthProvider);
        expect(post.permission).not.toContain(AclPermission.CmsView);
        expect(provider.permission).toContain(AclPermission.CmsView);
    });

    it("does NOT grant CmsView to other actor groups (editors etc. are manual / seeded)", async () => {
        const g = group("group-public-content", [
            entry(DocType.Post, [AclPermission.View, AclPermission.Edit], "group-public-editors"),
            entry(DocType.AuthProvider, [AclPermission.View], "group-public-editors"),
        ]);
        const { db, inserted } = mockDb(18, [g]);

        await v19(db);

        expect(inserted).toHaveLength(0);
        for (const e of g.acl) expect(e.permission).not.toContain(AclPermission.CmsView);
        expect(db.setSchemaVersion).toHaveBeenCalledWith(19);
    });

    it("is idempotent — does not re-add CmsView already present", async () => {
        const g = group("group-public-users", [
            entry(DocType.Post, [AclPermission.View, AclPermission.CmsView], "group-super-admins"),
            entry(
                DocType.AuthProvider,
                [AclPermission.View, AclPermission.CmsView],
                "group-public-users",
            ),
        ]);
        const { db, inserted } = mockDb(18, [g]);

        await v19(db);

        expect(inserted).toHaveLength(0);
        for (const e of g.acl) {
            const cmsViewPermissions = e.permission.filter(
                (p: AclPermission) => p === AclPermission.CmsView,
            );
            expect(cmsViewPermissions).toHaveLength(1);
        }
    });

    it("is a no-op when the schema version is not 18", async () => {
        const g = group("group-public-users", [
            entry(DocType.Post, [AclPermission.Edit], "group-super-admins"),
        ]);
        const { db, inserted } = mockDb(17, [g]);

        await v19(db);

        expect(db.processAllDocs).not.toHaveBeenCalled();
        expect(db.setSchemaVersion).not.toHaveBeenCalled();
        expect(inserted).toHaveLength(0);
    });
});
