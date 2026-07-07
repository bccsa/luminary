import { DbService } from "../db.service";
import { AclPermission, DocType } from "../../enums";

/**
 * Standard actor groups whose CmsView grants this upgrade backfills (GitHub #160).
 */
const SUPER_ADMINS_GROUP_ID = "group-super-admins";
const PUBLIC_USERS_GROUP_ID = "group-public-users";

/**
 * Upgrade the database schema from version 18 to 19.
 *
 * Backfills the new `CmsView` ACL permission (GitHub #160). CmsView gates CMS-scoped (cms:true)
 * reads/sync — what a user may see in the CMS, including drafts and expired Content. At deploy no
 * group holds it, so without a backfill the CMS would lose visibility until ACLs are updated. This
 * grants it narrowly to the standard system groups:
 *
 *  - `group-super-admins` → CmsView on every ACL entry assigned to it, across all target groups
 *    (full CMS visibility on all doc types).
 *  - `group-public-users` → CmsView on **AuthProvider** entries only, so the CMS can show the login
 *    providers to any user opening it (the login screen reads AuthProvider docs).
 *
 * Everyone else (editors, etc.) is granted CmsView explicitly via ACL administration / seeding — the
 * upgrade deliberately does NOT broadly grant it, so CmsView stays a real, narrowable permission.
 *
 * Idempotent: only pushes CmsView where missing, so re-running (e.g. `npm run seed` runs the upgrade
 * chain) is a no-op. Uses `insertDoc` to preserve `updatedTimeUtc`; the granted access takes effect
 * via the server-recomputed AccessMap delivered to clients on connect.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion === 18) {
            console.info("Upgrading database schema from version 18 to 19");

            let updatedCount = 0;
            let skippedCount = 0;

            await db.processAllDocs([DocType.Group], async (doc: any) => {
                if (!doc || !Array.isArray(doc.acl)) return;

                let changed = false;

                const grant = (entry: any) => {
                    if (
                        Array.isArray(entry.permission) &&
                        !entry.permission.includes(AclPermission.CmsView)
                    ) {
                        entry.permission.push(AclPermission.CmsView);
                        changed = true;
                    }
                };

                doc.acl
                    .filter(
                        (entry: any) =>
                            entry.groupId === SUPER_ADMINS_GROUP_ID ||
                            (entry.groupId === PUBLIC_USERS_GROUP_ID &&
                                entry.type === DocType.AuthProvider),
                    )
                    .forEach(grant);

                if (changed) {
                    await db.insertDoc(doc);
                    updatedCount++;
                } else {
                    skippedCount++;
                }
            });

            console.info(
                `CmsView backfill complete: ${updatedCount} groups updated, ${skippedCount} unchanged`,
            );

            await db.setSchemaVersion(19);
            console.info("Database schema upgrade from version 18 to 19 completed successfully");
        } else {
            console.info(
                `Skipping schema upgrade v19: current version is ${schemaVersion}, expected 18`,
            );
        }
    } catch (error) {
        console.error("Database schema upgrade from version 18 to 19 failed:", error);
        throw error;
    }
}
