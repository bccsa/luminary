import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, normalizeUserActivityDocument } from "luminary-shared";
import { migrateActivityFormat } from "../migrateActivityFormat";

let db: Awaited<ReturnType<typeof openDatabase>>;
const legacy = {
    _id: "liked:post",
    type: "userActivity",
    activityType: "liked",
    parentId: "post",
    activityTimeUtc: 10,
    updatedTimeUtc: 20,
};

beforeEach(async () => {
    db = await openDatabase({
        name: "activity-format-migration-test",
        includeUserActivityTable: false,
        quietAcks: true,
        requestPersistentStorage: false,
    });
    await db.clear();
});
afterEach(async () => {
    await db.delete();
});

describe("activity format migration", () => {
    it("moves documents and queued ids atomically, retaining the owner", async () => {
        await db.docs.put(legacy as any);
        await db.localChanges.add({
            docId: legacy._id,
            doc: { ...legacy, activityTimeUtc: 30 },
        } as any);
        await db.setLuminaryInternals("userActivityOwner", "https://issuer|subject");
        await migrateActivityFormat(db);

        const canonical = normalizeUserActivityDocument(legacy);
        expect(await db.docs.get(legacy._id)).toBeUndefined();
        expect(await db.docs.get(canonical._id)).toMatchObject({
            _id: canonical._id,
            type: "liked",
            activityTimeUtc: 30,
        });
        expect(await db.localChanges.toArray()).toEqual([
            expect.objectContaining({
                docId: canonical._id,
                doc: expect.objectContaining({ _id: canonical._id, type: "liked" }),
            }),
        ]);
        expect(await db.getLuminaryInternals("userActivityOwner")).toBe("https://issuer|subject");
    });

    it("keeps a pending highlight tombstone over an equal-time stored passage", async () => {
        const old = {
            _id: "highlighted:content:0-5",
            type: "userActivity",
            activityType: "highlighted",
            parentId: "post",
            contentId: "content",
            activityTimeUtc: 10,
            updatedTimeUtc: 20,
            payload: { range: { start: 0, end: 5, color: "blue", text: "hello" } },
        };
        await db.docs.put(normalizeUserActivityDocument(old));
        await db.localChanges.add({
            docId: old._id,
            doc: { ...old, deleted: true, payload: undefined },
        } as any);
        await migrateActivityFormat(db);

        const rows = (await db.docs.toArray()) as any[];
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ deleted: true, range: { start: 0, end: 5 } });
        expect(rows[0].range.text).toBeUndefined();
        expect(rows[0]).not.toHaveProperty("activityType");
    });

    it("coalesces queued versions of the same logical activity", async () => {
        await db.localChanges.bulkAdd([
            { docId: legacy._id, doc: legacy },
            { docId: legacy._id, doc: { ...legacy, activityTimeUtc: 30, deleted: true } },
        ] as any);
        await migrateActivityFormat(db);
        expect(await db.localChanges.count()).toBe(1);
        expect((await db.localChanges.toArray())[0].doc).toMatchObject({
            activityTimeUtc: 30,
            deleted: true,
        });
        await migrateActivityFormat(db);
        expect(await db.localChanges.count()).toBe(1);
    });

    it("rolls back without dropping data if a legacy record cannot be migrated", async () => {
        const invalid = { ...legacy, type: "unknown" };
        await db.docs.put(invalid as any);
        await db.localChanges.add({ docId: legacy._id, doc: legacy } as any);
        await expect(migrateActivityFormat(db)).rejects.toThrow();
        expect(await db.docs.get(legacy._id)).toEqual(invalid);
        expect(await db.localChanges.count()).toBe(1);
        expect(await db.getLuminaryInternals("activityDocumentFormat")).toBeUndefined();
    });
});
