import { DbService } from "../db.service";
import { AclPermission, DocType } from "../../enums";

/**
 * Doc types the Share permission is assignable on, mirroring
 * `changeRequests/aclValidation.ts`.
 */
const SHAREABLE_DOC_TYPES = [DocType.Post, DocType.Tag];

/**
 * Upgrade the database schema from version 20 to 21.
 *
 * Backfills the new `Share` ACL permission on every Post/Tag entry that already holds `View`, so
 * the audience that can read content in the app keeps being able to share it. Share is app-facing
 * and grants no additional read access, so a broad backfill is safe — unlike `CmsView` (v19/v20),
 * which had to stay narrow.
 *
 * Idempotent: only pushes `Share` where missing, so re-running (e.g. `npm run seed` runs the
 * upgrade chain) is a no-op. Uses `insertDoc` to preserve `updatedTimeUtc`; the granted access
 * takes effect via the server-recomputed AccessMap delivered to clients on connect.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion === 20) {
            console.info("Upgrading database schema from version 20 to 21");

            let updatedCount = 0;
            let skippedCount = 0;

            await db.processAllDocs([DocType.Group], async (doc: any) => {
                if (!doc || !Array.isArray(doc.acl)) return;

                let changed = false;

                doc.acl.forEach((entry: any) => {
                    if (!Array.isArray(entry.permission)) return;
                    if (!SHAREABLE_DOC_TYPES.includes(entry.type)) return;
                    if (entry.permission.includes(AclPermission.Share)) return;
                    if (!entry.permission.includes(AclPermission.View)) return;

                    entry.permission.push(AclPermission.Share);
                    changed = true;
                });

                if (changed) {
                    await db.insertDoc(doc);
                    updatedCount++;
                } else {
                    skippedCount++;
                }
            });

            console.info(
                `Share backfill complete: ${updatedCount} groups updated, ${skippedCount} unchanged`,
            );

            await db.setSchemaVersion(21);
            console.info("Database schema upgrade from version 20 to 21 completed successfully");
        } else {
            console.info(
                `Skipping schema upgrade v21: current version is ${schemaVersion}, expected 20`,
            );
        }
    } catch (error) {
        console.error("Database schema upgrade from version 20 to 21 failed:", error);
        throw error;
    }
}
