import v23 from "./v23";
import { AclPermission, DocType } from "../../enums";

describe("v23 — Affinity ACL backfill", () => {
    function mockDb(version: number, groups: any[], singletonExists = false) {
        const inserted: any[] = [];
        const upserted: any[] = [];
        const db = {
            getSchemaVersion: jest.fn().mockResolvedValue(version),
            setSchemaVersion: jest.fn().mockResolvedValue(undefined),
            getDoc: jest.fn(async () => ({
                docs: singletonExists
                    ? [{ _id: "global-affinity", type: DocType.GlobalAffinity, affinity: {} }]
                    : [],
            })),
            upsertDoc: jest.fn(async (doc: any) => {
                upserted.push(doc);
                return { ok: true };
            }),
            processAllDocs: jest.fn(async (_types: DocType[], cb: (doc: any) => Promise<void>) => {
                for (const g of groups) await cb(g);
            }),
            insertDoc: jest.fn(async (doc: any) => {
                inserted.push(doc);
            }),
        } as any;
        return { db, inserted, upserted };
    }

    function group(id: string, acl: any[] = []) {
        return { _id: id, type: DocType.Group, acl };
    }

    const find = (doc: any, type: DocType, groupId: string) =>
        doc.acl.find((a: any) => a.type === type && a.groupId === groupId);

    it("grants globalAffinity view to both user groups on group-public-content", async () => {
        const g = group("group-public-content");
        const { db, inserted } = mockDb(22, [g]);

        await v23(db);

        expect(inserted).toHaveLength(1);
        expect(find(inserted[0], DocType.GlobalAffinity, "group-public-users").permission).toEqual([
            AclPermission.View,
        ]);
        expect(find(inserted[0], DocType.GlobalAffinity, "group-private-users").permission).toEqual(
            [AclPermission.View],
        );
        expect(db.setSchemaVersion).toHaveBeenCalledWith(23);
    });

    it("grants super admins cmsView on globalAffinity so the CMS panel can read it", async () => {
        const { db, inserted } = mockDb(22, [group("group-super-admins")]);

        await v23(db);

        const entry = find(inserted[0], DocType.GlobalAffinity, "group-super-admins");
        expect(entry.permission).toEqual([AclPermission.View, AclPermission.CmsView]);
    });

    it("repairs the defaultAffinity entries #1803 shipped in seeding only", async () => {
        const { db, inserted } = mockDb(22, [
            group("group-public-content"),
            group("group-super-admins"),
        ]);

        await v23(db);

        expect(find(inserted[0], DocType.DefaultAffinity, "group-public-users").permission).toEqual(
            [AclPermission.View],
        );
        expect(find(inserted[1], DocType.DefaultAffinity, "group-super-admins").permission).toEqual(
            [
                AclPermission.View,
                AclPermission.Edit,
                AclPermission.Delete,
                AclPermission.Assign,
                AclPermission.CmsView,
            ],
        );
    });

    it("never grants Contribute — contribution is opted into via the CMS", async () => {
        const { db, inserted } = mockDb(22, [
            group("group-public-content"),
            group("group-super-admins"),
        ]);

        await v23(db);

        for (const doc of inserted) {
            for (const entry of doc.acl) {
                expect(entry.permission).not.toContain(AclPermission.Contribute);
            }
        }
    });

    it("leaves an entry an administrator has already narrowed alone", async () => {
        const g = group("group-public-content", [
            {
                type: DocType.GlobalAffinity,
                groupId: "group-public-users",
                permission: [AclPermission.View, AclPermission.Contribute],
            },
        ]);
        const { db, inserted } = mockDb(22, [g]);

        await v23(db);

        expect(find(inserted[0], DocType.GlobalAffinity, "group-public-users").permission).toEqual([
            AclPermission.View,
            AclPermission.Contribute,
        ]);
    });

    it("is idempotent — a second run writes nothing", async () => {
        const g = group("group-public-content");
        const first = mockDb(22, [g]);
        await v23(first.db);
        expect(first.inserted).toHaveLength(1);

        // Same (now-backfilled) group doc, database already at 23.
        const second = mockDb(23, [g]);
        await v23(second.db);
        expect(second.inserted).toHaveLength(0);
        expect(second.db.setSchemaVersion).not.toHaveBeenCalled();
    });

    it("ignores groups outside the backfill set", async () => {
        const { db, inserted } = mockDb(22, [group("group-editors")]);

        await v23(db);

        expect(inserted).toHaveLength(0);
        expect(db.setSchemaVersion).toHaveBeenCalledWith(23);
    });

    describe("the singleton itself", () => {
        // Regression: the first cut granted the ACLs here but shipped the document in seeding
        // only, so any deployment running upgrades rather than `npm run seed` ended up with
        // permission to a document that did not exist and every contribution rejected.
        it("creates the globalAffinity singleton when it is missing", async () => {
            const { db, upserted } = mockDb(22, [group("group-public-content")]);

            await v23(db);

            expect(upserted).toHaveLength(1);
            expect(upserted[0]._id).toBe("global-affinity");
            expect(upserted[0].type).toBe(DocType.GlobalAffinity);
            expect(upserted[0].memberOf).toEqual(["group-super-admins", "group-public-content"]);
            expect(upserted[0].affinity).toEqual({});
        });

        it("leaves an existing aggregate untouched", async () => {
            const { db, upserted } = mockDb(22, [group("group-public-content")], true);

            await v23(db);

            expect(upserted).toHaveLength(0);
        });

        it("does not create it when the schema is not at 22", async () => {
            const { db, upserted } = mockDb(21, [group("group-public-content")]);

            await v23(db);

            expect(upserted).toHaveLength(0);
        });
    });

    it("skips entirely when the schema is not at 22", async () => {
        const { db, inserted } = mockDb(21, [group("group-public-content")]);

        await v23(db);

        expect(inserted).toHaveLength(0);
        expect(db.setSchemaVersion).not.toHaveBeenCalled();
    });
});
