import { DbService } from "../db.service";
import { DocType } from "../../enums";
import { computeFtsData, USER_FTS_FIELDS, REDIRECT_FTS_FIELDS } from "../../util/ftsIndexing";

/**
 * Upgrade the database schema from version 17 to 18.
 * Backfills the server-authoritative FTS (full-text search) index on existing User and
 * Redirect documents so the strict server-side `/fts` search can find them. Mirrors the
 * Content backfill (v13) but uses the per-doctype field configs (name/email, slug/toSlug)
 * and writes no `ftsTokenCount` (these doctypes use strict substring search, not BM25).
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion === 17) {
            console.info("Upgrading database schema from version 17 to 18");

            let indexedCount = 0;
            let skippedCount = 0;

            await db.processAllDocs([DocType.User, DocType.Redirect], async (doc: any) => {
                if (!doc) return;

                const fields = doc.type === DocType.User ? USER_FTS_FIELDS : REDIRECT_FTS_FIELDS;
                const ftsData = computeFtsData(doc, fields);
                if (ftsData) {
                    doc.fts = ftsData.fts;
                    // Use insertDoc to preserve the existing updatedTimeUtc — `fts` is a
                    // server-only index field and must not churn already-synced clients.
                    await db.insertDoc(doc);
                    indexedCount++;
                } else {
                    skippedCount++;
                }
            });

            console.info(
                `User/Redirect FTS backfill complete: ${indexedCount} indexed, ${skippedCount} skipped (no indexable content)`,
            );

            await db.setSchemaVersion(18);
            console.info("Database schema upgrade from version 17 to 18 completed successfully");
        } else {
            console.info(
                `Skipping schema upgrade v18: current version is ${schemaVersion}, expected 17`,
            );
        }
    } catch (error) {
        console.error("Database schema upgrade from version 17 to 18 failed:", error);
        throw error;
    }
}
