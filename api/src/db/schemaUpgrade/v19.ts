import { DbService } from "../db.service";
import { AclPermission, DocType } from "../../enums";

/**
 * Standard actor groups whose CmsView grants this upgrade backfills (GitHub #160).
 */
const SUPER_ADMINS_GROUP_ID = "group-super-admins";
const PUBLIC_USERS_GROUP_ID = "group-public-users";
const CMS_EDITOR_GROUP_IDS = ["group-public-editors", "group-private-editors"];
const CMS_EDITOR_DOC_TYPES = [
    DocType.Group,
    DocType.Language,
    DocType.Post,
    DocType.Redirect,
    DocType.Storage,
    DocType.Tag,
];

/**
 * Upgrade the database schema from version 18 to 19.
 *
 * Backfills the new `CmsView` ACL permission (GitHub #160). CmsView gates CMS-scoped (cms:true)
 * reads/sync — what a user may see in the CMS, including drafts and expired Content. At deploy no
 * group holds it, so without a backfill the CMS would lose visibility until ACLs are updated. This
 * grants it narrowly to the standard system groups:
 *
 *  - `group-super-admins` → direct CmsView rows on every target group/doc type in the existing
 *    ACL graph (full CMS visibility without granting CmsView to public/private user groups).
 *  - `group-public-users` → CmsView on **AuthProvider** entries only, so the CMS can show the login
 *    providers to any user opening it (the login screen reads AuthProvider docs).
 *  - `group-public-editors` / `group-private-editors` → CmsView on CMS-managed content, language,
 *    group, redirect and storage entries, matching the seeded editor roles.
 *
 * Everyone else is granted CmsView explicitly via ACL administration / seeding — the upgrade
 * deliberately does NOT broadly grant it, so CmsView stays a real, narrowable permission.
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

                const docTypes = new Set(
                    doc.acl.map((entry: any) => entry.type).filter((type: any) => type),
                );

                doc.acl
                    .filter(
                        (entry: any) =>
                            entry.groupId === SUPER_ADMINS_GROUP_ID ||
                            (entry.groupId === PUBLIC_USERS_GROUP_ID &&
                                entry.type === DocType.AuthProvider) ||
                            (CMS_EDITOR_GROUP_IDS.includes(entry.groupId) &&
                                CMS_EDITOR_DOC_TYPES.includes(entry.type)),
                    )
                    .forEach(grant);

                docTypes.forEach((type: DocType) => {
                    if (
                        !doc.acl.some(
                            (entry: any) =>
                                entry.groupId === SUPER_ADMINS_GROUP_ID && entry.type === type,
                        )
                    ) {
                        doc.acl.push({
                            type,
                            groupId: SUPER_ADMINS_GROUP_ID,
                            permission: [AclPermission.View, AclPermission.CmsView],
                        });
                        changed = true;
                    }
                });

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
