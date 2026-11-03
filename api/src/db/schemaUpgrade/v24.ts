import { DbService } from "../db.service";
import { DocType } from "../../enums";

/**
 * Upgrade the database schema from version 23 to 24.
 *
 * Re-stamps `parentMediaBucketId` on every Content doc from its parent Post/Tag's
 * `mediaBucketId`. Saving a Content doc used to persist the client's copy of the field
 * instead of the parent's, so content saved without it lost it and the app could not
 * resolve the parent's media.
 *
 * Idempotent: only writes documents whose value differs. Uses `upsertDoc` so `updatedTimeUtc`
 * is bumped and the repaired documents sync to clients.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion !== 23) {
            console.info(
                `Skipping schema upgrade v24: current version is ${schemaVersion}, expected 23`,
            );
            return;
        }

        console.info("Upgrading database schema from version 23 to 24");

        const parentIds: string[] = [];
        await db.processAllDocs([DocType.Post, DocType.Tag], (doc: any) => {
            if (doc?._id) parentIds.push(doc._id);
        });

        let repaired = 0;
        for (const parentId of parentIds) {
            const parent = (await db.getDoc(parentId)).docs[0];
            if (!parent) continue;

            for (const content of (await db.getContentByParentId(parentId)).docs) {
                if (content.parentMediaBucketId === parent.mediaBucketId) continue;
                content.parentMediaBucketId = parent.mediaBucketId;
                await db.upsertDoc(content);
                repaired++;
            }
        }

        console.info(`Content parentMediaBucketId re-stamped: ${repaired} document(s) repaired`);

        await db.setSchemaVersion(24);
        console.info("Database schema upgrade from version 23 to 24 completed successfully");
    } catch (error) {
        console.error("Database schema upgrade from version 23 to 24 failed:", error);
        throw error;
    }
}
