import v19 from "./v19";
import { AclPermission, DocType } from "../../enums";
import { PermissionSystem } from "../../permissions/permissions.service";

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

        expect(inserted).toEqual([superAdmins, publicUsers, privateUsers, publicContent]);
        for (const g of [superAdmins, publicUsers, privateUsers]) {
            for (const e of g.acl) {
                expect(e.permission).toContain(AclPermission.CmsView);
            }
        }
        expect(publicContent.acl[0].permission).not.toContain(AclPermission.CmsView);
        expect(publicContent.acl).toContainEqual({
            type: DocType.Post,
            groupId: "group-super-admins",
            permission: [AclPermission.View, AclPermission.CmsView],
        });
        expect(db.setSchemaVersion).toHaveBeenCalledWith(19);
    });

    it("adds missing direct super-admin CmsView entries for every target group doc type", async () => {
        const g = group("group-public-content", [
            entry(DocType.Post, [AclPermission.View], "group-public-users"),
            entry(DocType.Tag, [AclPermission.View], "group-public-editors"),
            entry(DocType.Group, [AclPermission.View], "group-public-editors"),
        ]);
        const { db, inserted } = mockDb(18, [g]);

        await v19(db);

        expect(inserted).toEqual([g]);
        for (const type of [DocType.Post, DocType.Tag, DocType.Group]) {
            expect(g.acl).toContainEqual({
                type,
                groupId: "group-super-admins",
                permission: [AclPermission.View, AclPermission.CmsView],
            });
        }
        expect(g.acl[0].permission).not.toContain(AclPermission.CmsView);
    });

    it("gives super admins CmsView after the permission graph is rebuilt", async () => {
        const groups = [
            group("group-super-admins", []),
            group("group-public-users", [
                entry(DocType.Post, [AclPermission.View], "group-super-admins"),
            ]),
            group("group-test-content", [
                entry(DocType.Post, [AclPermission.View], "group-public-users"),
            ]),
        ];
        const { db } = mockDb(18, groups);

        await v19(db);

        PermissionSystem.upsertGroups([...groups]);

        try {
            expect(
                PermissionSystem.verifyAccess(
                    ["group-test-content"],
                    DocType.Post,
                    AclPermission.CmsView,
                    ["group-super-admins"],
                ),
            ).toBe(true);
            expect(
                PermissionSystem.verifyAccess(
                    ["group-test-content"],
                    DocType.Post,
                    AclPermission.CmsView,
                    ["group-public-users"],
                ),
            ).toBe(false);
        } finally {
            PermissionSystem.removeGroups([
                "group-super-admins",
                "group-public-users",
                "group-test-content",
            ]);
        }
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

    it("grants CmsView to standard editor ACL entries for CMS-synced doc types", async () => {
        const publicContent = group("group-public-content", [
            entry(DocType.Post, [AclPermission.View, AclPermission.Edit], "group-public-editors"),
            entry(DocType.Group, [AclPermission.View], "group-public-editors"),
            entry(DocType.AuthProvider, [AclPermission.View], "group-public-editors"),
        ]);
        const languages = group("group-languages", [
            entry(DocType.Language, [AclPermission.View], "group-private-editors"),
            entry(DocType.Storage, [AclPermission.View], "group-private-editors"),
        ]);
        const { db, inserted } = mockDb(18, [publicContent, languages]);

        await v19(db);

        expect(inserted).toEqual([publicContent, languages]);
        expect(publicContent.acl[0].permission).toContain(AclPermission.CmsView);
        expect(publicContent.acl[1].permission).toContain(AclPermission.CmsView);
        expect(publicContent.acl[2].permission).not.toContain(AclPermission.CmsView);
        for (const e of languages.acl) expect(e.permission).toContain(AclPermission.CmsView);
        expect(db.setSchemaVersion).toHaveBeenCalledWith(19);
    });

    it("does NOT grant CmsView to app-only user groups", async () => {
        const g = group("group-public-content", [
            entry(DocType.Post, [AclPermission.View], "group-public-users"),
            entry(DocType.Language, [AclPermission.View], "group-private-users"),
        ]);
        const { db, inserted } = mockDb(18, [g]);

        await v19(db);

        expect(inserted).toEqual([g]);
        for (const e of g.acl.filter((entry: any) => entry.groupId !== "group-super-admins")) {
            expect(e.permission).not.toContain(AclPermission.CmsView);
        }
        expect(db.setSchemaVersion).toHaveBeenCalledWith(19);
    });

    it("is idempotent — does not re-add CmsView already present", async () => {
        const g = group("group-public-users", [
            entry(DocType.Post, [AclPermission.View, AclPermission.CmsView], "group-super-admins"),
            entry(DocType.Group, [AclPermission.View, AclPermission.CmsView], "group-super-admins"),
            entry(
                DocType.AuthProvider,
                [AclPermission.View, AclPermission.CmsView],
                "group-super-admins",
            ),
            entry(DocType.Group, [AclPermission.View, AclPermission.CmsView], "group-public-editors"),
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
