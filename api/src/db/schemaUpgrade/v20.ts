import { DbService } from "../db.service";
import { DocType } from "../../enums";

/**
 * Upgrade the database schema from version 19 to 20.
 *
 * Backfills `parentAlwaysOffline` onto Content docs whose parent Post/Tag has
 * `alwaysOffline === true`. New saves already propagate via processPostTagDto /
 * processContentDto; this covers existing data created before the field existed.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion !== 19) {
            console.info(
                `Skipping schema upgrade v20: current version is ${schemaVersion}, expected 19`,
            );
            return;
        }

        console.info("Upgrading database schema from version 19 to 20");

        let parentsUpdated = 0;
        let childrenUpdated = 0;

        for (const docType of [DocType.Post, DocType.Tag]) {
            const { docs } = await db.getDocsByType(docType);

            for (const parent of docs) {
                if (!parent.alwaysOffline) continue;

                const children = await db.getContentByParentId(parent._id);
                for (const child of children.docs) {
                    if (child.parentAlwaysOffline === true) continue;
                    child.parentAlwaysOffline = true;
                    await db.upsertDoc(child);
                    childrenUpdated++;
                }
                parentsUpdated++;
            }
        }

        console.info(
            `parentAlwaysOffline backfill: ${parentsUpdated} parent(s) with alwaysOffline; ${childrenUpdated} child content doc(s) updated.`,
        );

        await db.setSchemaVersion(20);
        console.info("Database schema upgrade from version 19 to 20 completed successfully");
    } catch (error) {
        console.error("Database schema upgrade to version 20 failed:", error);
        throw error;
    }
}
