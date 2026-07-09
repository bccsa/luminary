import { DbService } from "../db.service";
import { AclPermission, DocType } from "../../enums";
import { DEFAULT_AFFINITY_ID } from "../../util/userAffinity";

const SUPER_ADMINS_GROUP_ID = "group-super-admins";

/**
 * Upgrade the database schema from version 19 to 20.
 *
 * Backfills the CMS-managed "default affinity" recommendation feature (new
 * `DocType.DefaultAffinity`) for existing databases:
 *
 *  1. Grants `group-super-admins` a `DefaultAffinity` ACL entry
 *     (View/Edit/Delete/Assign/CmsView) — mirrors the v19 CmsView backfill
 *     pattern. Without this, an existing DB's super admins have no permission
 *     to create/edit the singleton doc via the CMS.
 *  2. Seeds the singleton `DefaultAffinityDto` doc (fixed `_id` =
 *     `DEFAULT_AFFINITY_ID`) with an empty profile if none exists yet — so
 *     `AuthIdentityService.getDefaultAffinity()` has a doc to find (an absent
 *     doc is handled gracefully too; this just gives CMS admins something to
 *     open and edit immediately rather than a doc that appears only after
 *     their first save).
 *
 * Idempotent: the ACL grant is skipped where already present (`insertDoc`
 * preserves the group's existing `updatedTimeUtc`, matching v19); the
 * singleton doc is only created if absent (a fresh doc uses `upsertDoc`,
 * which stamps `updatedTimeUtc` itself, matching the v9 new-doc pattern).
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

        // 1. ACL backfill on group-super-admins.
        let aclUpdated = false;
        await db.processAllDocs([DocType.Group], async (doc: any) => {
            if (!doc || doc._id !== SUPER_ADMINS_GROUP_ID || !Array.isArray(doc.acl)) return;

            const hasEntry = doc.acl.some((entry: any) => entry.type === DocType.DefaultAffinity);
            if (hasEntry) return;

            doc.acl.push({
                type: DocType.DefaultAffinity,
                groupId: SUPER_ADMINS_GROUP_ID,
                permission: [
                    AclPermission.View,
                    AclPermission.Edit,
                    AclPermission.Delete,
                    AclPermission.Assign,
                    AclPermission.CmsView,
                ],
            });
            await db.insertDoc(doc);
            aclUpdated = true;
        });

        console.info(
            aclUpdated
                ? "Granted DefaultAffinity ACL entry on group-super-admins"
                : "DefaultAffinity ACL entry already present on group-super-admins",
        );

        // 2. Seed the singleton doc if it doesn't exist yet.
        const existing = await db.getDoc(DEFAULT_AFFINITY_ID);
        if (!existing.docs?.length) {
            await db.upsertDoc({
                _id: DEFAULT_AFFINITY_ID,
                type: DocType.DefaultAffinity,
                memberOf: [SUPER_ADMINS_GROUP_ID],
                affinity: {},
            });
            console.info("Created the default affinity singleton doc");
        } else {
            console.info("Default affinity singleton doc already exists");
        }

        await db.setSchemaVersion(20);
        console.info("Database schema upgrade from version 19 to 20 completed successfully");
    } catch (error) {
        console.error("Database schema upgrade from version 19 to 20 failed:", error);
        throw error;
    }
}
