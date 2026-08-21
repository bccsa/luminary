import { DbService } from "../db.service";
import { AclPermission, DocType } from "../../enums";
import { cmsOnlyPermissions } from "../../changeRequests/aclValidation";

/**
 * The anonymous/default group, deliberately left out of this backfill (see below).
 */
const PUBLIC_USERS_GROUP_ID = "group-public-users";

/**
 * Upgrade the database schema from version 19 to 20.
 *
 * Backfills `CmsView` on existing ACL entries that hold a CMS-only permission (Edit, Delete, Assign,
 * Translate, Publish). Those permissions used to imply `View`, so entries were granted app-facing
 * visibility as a side effect of a CMS-only permission change; `CmsView` is what they actually
 * imply. Entries holding `View` alone are genuine app-consumer grants and are left untouched, so
 * CmsView stays a real, narrowable permission (ADR 0013).
 *
 * `group-public-users` is skipped: it is effectively the anonymous group, and its broad seeded
 * Edit/Delete/Publish grants would otherwise turn into CMS visibility of drafts and expired content
 * for anyone opening the CMS. Its one intended CmsView grant (AuthProvider) was made by v19.
 *
 * Idempotent: only pushes CmsView where missing, so re-running (e.g. `npm run seed` runs the upgrade
 * chain) is a no-op. Uses `insertDoc` to preserve `updatedTimeUtc`; the granted access takes effect
 * via the server-recomputed AccessMap delivered to clients on connect.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion === 19) {
            console.info("Upgrading database schema from version 19 to 20");

            let updatedCount = 0;
            let skippedCount = 0;

            await db.processAllDocs([DocType.Group], async (doc: any) => {
                if (!doc || !Array.isArray(doc.acl)) return;
                if (doc._id === PUBLIC_USERS_GROUP_ID) {
                    skippedCount++;
                    return;
                }

                let changed = false;

                doc.acl.forEach((entry: any) => {
                    if (!Array.isArray(entry.permission)) return;
                    if (entry.permission.includes(AclPermission.CmsView)) return;
                    if (!entry.permission.some((p: AclPermission) => cmsOnlyPermissions.includes(p)))
                        return;

                    entry.permission.push(AclPermission.CmsView);
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
                `CmsView implication backfill complete: ${updatedCount} groups updated, ${skippedCount} unchanged`,
            );

            await db.setSchemaVersion(20);
            console.info("Database schema upgrade from version 19 to 20 completed successfully");
        } else {
            console.info(
                `Skipping schema upgrade v20: current version is ${schemaVersion}, expected 19`,
            );
        }
    } catch (error) {
        console.error("Database schema upgrade from version 19 to 20 failed:", error);
        throw error;
    }
}
