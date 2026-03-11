import { DbService } from "../db.service";
import { DocType } from "../../enums";
import { computeFtsData } from "../../util/ftsIndexing";

/**
 * Upgrade the database schema from version 12 to 13.
 * Backfills FTS (full-text search) index data on all Content documents.
 * Previously FTS indexing was done client-side; it is now computed server-side
 * and delivered as part of the ContentDto.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion === 12) {
            console.info("Upgrading database schema from version 12 to 13");

            let indexedCount = 0;
            let skippedCount = 0;

            await db.processAllDocs([DocType.Content], async (doc: any) => {
                if (!doc) return;

                const ftsData = computeFtsData(doc);
                if (ftsData) {
                    doc.fts = ftsData.fts;
                    doc.ftsTokenCount = ftsData.ftsTokenCount;
                    // Use insertDoc to preserve the existing updatedTimeUtc
                    await db.insertDoc(doc);
                    indexedCount++;
                } else {
                    skippedCount++;
                }
            });

            console.info(
                `FTS backfill complete: ${indexedCount} indexed, ${skippedCount} skipped (no indexable content)`,
            );

            await db.setSchemaVersion(13);
            console.info("Database schema upgrade from version 12 to 13 completed successfully");
        } else {
            console.info(
                `Skipping schema upgrade v13: current version is ${schemaVersion}, expected 12`,
            );
        }
    } catch (error) {
        console.error("Database schema upgrade from version 12 to 13 failed:", error);
        throw error;
    }
}
