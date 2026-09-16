import { DbService } from "../db.service";
import { AclPermission, DocType } from "../../enums";

/**
 * Doc types the Share permission is assignable on, mirroring
 * `changeRequests/aclValidation.ts`.
 */
const SHAREABLE_DOC_TYPES = [DocType.Post, DocType.Tag];

/** Group backfilled with Share, mirroring the seed default (`group-public-content.json`). */
const SHARE_BACKFILL_GROUP_ID = "group-public-content";

/**
 * Upgrade the database schema from version 21 to 22.
 *
 * Backfills the new `Share` ACL permission on `group-public-content`'s Post/Tag entries that
 * already hold `View`, mirroring the seed default — sharing is enabled for public content only,
 * for now.
 *
 * Idempotent: only pushes `Share` where missing, so re-running (e.g. `npm run seed` runs the
 * upgrade chain) is a no-op. Uses `insertDoc` to preserve `updatedTimeUtc`; the granted access
 * takes effect via the server-recomputed AccessMap delivered to clients on connect.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion === 21) {
            console.info("Upgrading database schema from version 21 to 22");

            let changed = false;

            await db.processAllDocs([DocType.Group], async (doc: any) => {
                if (!doc || doc._id !== SHARE_BACKFILL_GROUP_ID || !Array.isArray(doc.acl)) return;

                let docChanged = false;

                doc.acl.forEach((entry: any) => {
                    if (!Array.isArray(entry.permission)) return;
                    if (!SHAREABLE_DOC_TYPES.includes(entry.type)) return;
                    if (entry.permission.includes(AclPermission.Share)) return;
                    if (!entry.permission.includes(AclPermission.View)) return;

                    entry.permission.push(AclPermission.Share);
                    docChanged = true;
                });

                if (docChanged) {
                    await db.insertDoc(doc);
                    changed = true;
                }
            });

            console.info(
                changed
                    ? `Share backfill complete: ${SHARE_BACKFILL_GROUP_ID} updated`
                    : `Share backfill complete: ${SHARE_BACKFILL_GROUP_ID} unchanged`,
            );

            await db.setSchemaVersion(22);
            console.info("Database schema upgrade from version 21 to 22 completed successfully");
        } else {
            console.info(
                `Skipping schema upgrade v22: current version is ${schemaVersion}, expected 21`,
            );
        }
    } catch (error) {
        console.error("Database schema upgrade from version 21 to 22 failed:", error);
        throw error;
    }
}
