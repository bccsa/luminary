import { DbService } from "../db.service";
import { AclPermission, DocType } from "../../enums";
import { DEFAULT_AFFINITY_CONFIG, DEFAULT_AFFINITY_ID } from "../../util/defaultAffinity";

const SUPER_ADMINS_GROUP_ID = "group-super-admins";
const PUBLIC_CONTENT_GROUP_ID = "group-public-content";
const PUBLIC_USERS_GROUP_ID = "group-public-users";
const PRIVATE_USERS_GROUP_ID = "group-private-users";

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
 *  2. Grants `group-public-content` a `DefaultAffinity` View-only ACL entry for
 *     `group-public-users`/`group-private-users` — the same pattern that already
 *     exposes Redirect/Storage to ordinary app users. The doc is synced to
 *     clients like any other doc type (gated by its own `memberOf`/ACL, not a
 *     bespoke auth-identity delivery path), so without this grant regular app
 *     users would never receive the baseline/config at all.
 *  3. Seeds the singleton `DefaultAffinityDto` doc (fixed `_id` =
 *     `DEFAULT_AFFINITY_ID`) with an empty profile and the default affinity
 *     engine tuning config if none exists yet, with `memberOf` covering both
 *     groups above so it's editable by admins and viewable by app users. If the
 *     doc already exists but predates this grant (e.g. re-running against a DB
 *     upgraded by an earlier version of this file), backfills `memberOf` to add
 *     `group-public-content`.
 *
 * Idempotent: each ACL grant is skipped where already present (`insertDoc`
 * preserves the group's existing `updatedTimeUtc`, matching v19); the singleton
 * doc is created only if absent (a fresh doc uses `upsertDoc`, which stamps
 * `updatedTimeUtc` itself, matching the v9 new-doc pattern) and its `memberOf`
 * is topped up in place otherwise.
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

        // 1 + 2. ACL backfill on group-super-admins and group-public-content.
        let aclUpdated = false;
        await db.processAllDocs([DocType.Group], async (doc: any) => {
            if (!doc || !Array.isArray(doc.acl)) return;

            if (doc._id === SUPER_ADMINS_GROUP_ID) {
                const hasEntry = doc.acl.some(
                    (entry: any) => entry.type === DocType.DefaultAffinity,
                );
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
            } else if (doc._id === PUBLIC_CONTENT_GROUP_ID) {
                let changed = false;
                for (const groupId of [PUBLIC_USERS_GROUP_ID, PRIVATE_USERS_GROUP_ID]) {
                    const hasEntry = doc.acl.some(
                        (entry: any) =>
                            entry.type === DocType.DefaultAffinity && entry.groupId === groupId,
                    );
                    if (hasEntry) continue;

                    doc.acl.push({
                        type: DocType.DefaultAffinity,
                        groupId,
                        permission: [AclPermission.View],
                    });
                    changed = true;
                }
                if (changed) {
                    await db.insertDoc(doc);
                    aclUpdated = true;
                }
            }
        });

        console.info(
            aclUpdated
                ? "Granted DefaultAffinity ACL entries"
                : "DefaultAffinity ACL entries already present",
        );

        // 3. Seed the singleton doc, or top up its memberOf if it predates the
        // group-public-content grant.
        const existing = await db.getDoc(DEFAULT_AFFINITY_ID);
        const existingDoc = existing.docs?.[0] as any;
        if (!existingDoc) {
            await db.upsertDoc({
                _id: DEFAULT_AFFINITY_ID,
                type: DocType.DefaultAffinity,
                memberOf: [SUPER_ADMINS_GROUP_ID, PUBLIC_CONTENT_GROUP_ID],
                affinity: {},
                config: DEFAULT_AFFINITY_CONFIG,
            });
            console.info("Created the default affinity singleton doc");
        } else if (!(existingDoc.memberOf ?? []).includes(PUBLIC_CONTENT_GROUP_ID)) {
            await db.upsertDoc({
                ...existingDoc,
                memberOf: [...(existingDoc.memberOf ?? []), PUBLIC_CONTENT_GROUP_ID],
            });
            console.info("Backfilled group-public-content onto the default affinity singleton doc");
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
