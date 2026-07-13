import v20 from "./v20";
import { AclPermission, DocType } from "../../enums";
import { DEFAULT_AFFINITY_ID } from "../../util/defaultAffinity";

describe("v20 — default affinity ACL + singleton backfill", () => {
    function mockDb(version: number, groups: any[], existingDefaultAffinity: any[] = []) {
        const inserted: any[] = [];
        const upserted: any[] = [];
        const db = {
            getSchemaVersion: jest.fn().mockResolvedValue(version),
            setSchemaVersion: jest.fn().mockResolvedValue(undefined),
            processAllDocs: jest.fn(async (_types: DocType[], cb: (doc: any) => Promise<void>) => {
                for (const g of groups) await cb(g);
            }),
            insertDoc: jest.fn(async (doc: any) => {
                inserted.push(doc);
            }),
            getDoc: jest.fn().mockResolvedValue({ docs: existingDefaultAffinity }),
            upsertDoc: jest.fn(async (doc: any) => {
                upserted.push(doc);
            }),
        } as any;
        return { db, inserted, upserted };
    }

    function entry(type: DocType, permission: AclPermission[]) {
        return { type, groupId: "group-super-admins", permission };
    }

    function group(id: string, acl: any[]) {
        return { _id: id, type: DocType.Group, acl };
    }

    it("grants a DefaultAffinity ACL entry on group-super-admins when missing", async () => {
        const g = group("group-super-admins", [entry(DocType.Post, [AclPermission.View])]);
        const { db, inserted } = mockDb(19, [g], [{ _id: DEFAULT_AFFINITY_ID }]);

        await v20(db);

        expect(inserted).toHaveLength(1);
        const daEntry = inserted[0].acl.find((e: any) => e.type === DocType.DefaultAffinity);
        expect(daEntry).toBeDefined();
        expect(daEntry.permission).toEqual(
            expect.arrayContaining([
                AclPermission.View,
                AclPermission.Edit,
                AclPermission.Delete,
                AclPermission.Assign,
                AclPermission.CmsView,
            ]),
        );
        expect(db.setSchemaVersion).toHaveBeenCalledWith(20);
    });

    it("does NOT touch other groups", async () => {
        const g = group("group-public-editors", [entry(DocType.Post, [AclPermission.View])]);
        const { db, inserted } = mockDb(19, [g], [{ _id: DEFAULT_AFFINITY_ID }]);

        await v20(db);

        expect(inserted).toHaveLength(0);
        expect(g.acl.some((e: any) => e.type === DocType.DefaultAffinity)).toBe(false);
    });

    it("is idempotent — does not re-grant an already-present ACL entry", async () => {
        const g = group("group-super-admins", [
            entry(DocType.Post, [AclPermission.View]),
            entry(DocType.DefaultAffinity, [AclPermission.View, AclPermission.Edit]),
        ]);
        const { db, inserted } = mockDb(19, [g], [{ _id: DEFAULT_AFFINITY_ID }]);

        await v20(db);

        expect(inserted).toHaveLength(0);
        expect(g.acl.filter((e: any) => e.type === DocType.DefaultAffinity)).toHaveLength(1);
    });

    it("creates the singleton doc when absent", async () => {
        const g = group("group-super-admins", [entry(DocType.Post, [AclPermission.View])]);
        const { db, upserted } = mockDb(19, [g], []);

        await v20(db);

        expect(upserted).toHaveLength(1);
        expect(upserted[0]).toMatchObject({
            _id: DEFAULT_AFFINITY_ID,
            type: DocType.DefaultAffinity,
            memberOf: ["group-super-admins"],
            affinity: {},
        });
    });

    it("does NOT recreate the singleton doc when already present", async () => {
        const g = group("group-super-admins", [entry(DocType.Post, [AclPermission.View])]);
        const { db, upserted } = mockDb(19, [g], [{ _id: DEFAULT_AFFINITY_ID, affinity: { a: 1 } }]);

        await v20(db);

        expect(upserted).toHaveLength(0);
    });

    it("is a no-op when the schema version is not 19", async () => {
        const g = group("group-super-admins", [entry(DocType.Post, [AclPermission.Edit])]);
        const { db, inserted, upserted } = mockDb(18, [g], []);

        await v20(db);

        expect(db.processAllDocs).not.toHaveBeenCalled();
        expect(db.setSchemaVersion).not.toHaveBeenCalled();
        expect(inserted).toHaveLength(0);
        expect(upserted).toHaveLength(0);
    });
});
