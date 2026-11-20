import { DbService } from "../db.service";
import { DocType, Uuid } from "../../enums";

const sameIds = (a: Uuid[] | undefined, b: Uuid[]) =>
    (a ?? []).length === b.length && b.every((id) => (a ?? []).includes(id));

/**
 * Upgrade the database schema from version 22 to 23.
 *
 * Rebuilds every Tag's `taggedDocs` and its content's `parentTaggedDocs` from the `tags` of
 * the stored Post/Tag documents. Saving a Tag used to persist the client's stale copy of
 * `taggedDocs`, which dropped posts from categories on the app (#2366).
 *
 * Idempotent: only writes documents whose cache differs. Uses `upsertDoc` so `updatedTimeUtc`
 * is bumped and the repaired documents sync to clients.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion !== 22) {
            console.info(
                `Skipping schema upgrade v23: current version is ${schemaVersion}, expected 22`,
            );
            return;
        }

        console.info("Upgrading database schema from version 22 to 23");

        const tagIds: Uuid[] = [];
        await db.processAllDocs([DocType.Tag], (doc: any) => {
            if (doc?._id) tagIds.push(doc._id);
        });
        const taggedByTag = await db.getTaggedDocIds(tagIds);

        let repaired = 0;
        for (const tagId of tagIds) {
            const tagged = taggedByTag.get(tagId);

            const tag = (await db.getDoc(tagId)).docs[0];
            if (tag && !sameIds(tag.taggedDocs, tagged)) {
                tag.taggedDocs = tagged;
                await db.upsertDoc(tag);
                repaired++;
            }

            for (const content of (await db.getContentByParentId(tagId)).docs) {
                if (sameIds(content.parentTaggedDocs, tagged)) continue;
                content.parentTaggedDocs = tagged;
                await db.upsertDoc(content);
                repaired++;
            }
        }

        console.info(`Tagged documents cache rebuilt: ${repaired} document(s) repaired`);

        await db.setSchemaVersion(23);
        console.info("Database schema upgrade from version 22 to 23 completed successfully");
    } catch (error) {
        console.error("Database schema upgrade from version 22 to 23 failed:", error);
        throw error;
    }
}
