import { DbService } from "../db.service";
import { AclPermission, DocType } from "../../enums";
import { GLOBAL_AFFINITY_ID } from "../../util/globalAffinity";

/** Groups the singleton belongs to, mirroring `db/seedingDocs/global-affinity.json`. */
const SINGLETON_MEMBER_OF = ["group-super-admins", "group-public-content"];

/**
 * ACL entries this upgrade ensures exist, mirroring the seed defaults in
 * `group-public-content.json` / `group-super-admins.json`.
 *
 * `Contribute` appears nowhere. It is the write permission for the aggregate, and following
 * v19's precedent a new permission stays real and narrowable — an existing deployment opts
 * groups in explicitly via the CMS rather than having every client start feeding the global
 * profile the moment this lands.
 */
const BACKFILL: Record<string, { type: DocType; groupId: string; permission: AclPermission[] }[]> =
    {
        "group-public-content": [
            {
                type: DocType.GlobalAffinity,
                groupId: "group-public-users",
                permission: [AclPermission.View],
            },
            {
                type: DocType.GlobalAffinity,
                groupId: "group-private-users",
                permission: [AclPermission.View],
            },
            {
                type: DocType.DefaultAffinity,
                groupId: "group-public-users",
                permission: [AclPermission.View],
            },
            {
                type: DocType.DefaultAffinity,
                groupId: "group-private-users",
                permission: [AclPermission.View],
            },
        ],
        "group-super-admins": [
            {
                type: DocType.GlobalAffinity,
                groupId: "group-super-admins",
                permission: [AclPermission.View, AclPermission.CmsView],
            },
            {
                type: DocType.DefaultAffinity,
                groupId: "group-super-admins",
                permission: [
                    AclPermission.View,
                    AclPermission.Edit,
                    AclPermission.Delete,
                    AclPermission.Assign,
                    AclPermission.CmsView,
                ],
            },
        ],
    };

/**
 * Upgrade the database schema from version 22 to 23.
 *
 * Grants read access to the new `globalAffinity` singleton, and repairs the `defaultAffinity`
 * entries that GitHub #1803 shipped in seeding only — it added no upgrade, so a database
 * installed before it has no affinity ACL at all and cannot sync either singleton.
 *
 * Also creates the `globalAffinity` singleton itself. Granting access without it would leave
 * the feature permanently dead on any deployment that runs upgrades but not `npm run seed`:
 * the document is the aggregator's only write target, and a contribution against a missing
 * one is rejected outright (`validateChangeRequestAccess`). Unlike `defaultAffinity` — which
 * the CMS creates lazily on first save — nothing else would ever bring it into existence.
 *
 * Idempotent: an ACL entry is added only when that (type, groupId) pair is absent, so an
 * existing entry keeps whatever an administrator has since narrowed it to, and the singleton
 * is created only when missing — an aggregate that has already accumulated is never reset.
 * Uses `insertDoc` for groups to preserve `updatedTimeUtc`; the granted access reaches clients
 * via the server-recomputed AccessMap on their next connect.
 */
/**
 * Create the empty `globalAffinity` singleton if it does not already exist, mirroring
 * `db/seedingDocs/global-affinity.json`. Left alone when present, so an aggregate that has
 * already accumulated is never wiped.
 */
async function createGlobalAffinitySingleton(db: DbService) {
    const existing = await db.getDoc(GLOBAL_AFFINITY_ID);
    if (existing.docs?.length) return;

    await db.upsertDoc({
        _id: GLOBAL_AFFINITY_ID,
        type: DocType.GlobalAffinity,
        memberOf: SINGLETON_MEMBER_OF,
        affinity: {},
        contributionCount: 0,
    });
    console.info("Created the globalAffinity singleton");
}

export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion === 22) {
            console.info("Upgrading database schema from version 22 to 23");

            await createGlobalAffinitySingleton(db);

            let updatedCount = 0;

            await db.processAllDocs([DocType.Group], async (doc: any) => {
                const wanted = doc?._id ? BACKFILL[doc._id] : undefined;
                if (!wanted || !Array.isArray(doc.acl)) return;

                const added = wanted.filter(
                    (w) => !doc.acl.some((a: any) => a.type === w.type && a.groupId === w.groupId),
                );
                if (!added.length) return;

                doc.acl.push(...added.map((a) => ({ ...a, permission: [...a.permission] })));
                await db.insertDoc(doc);
                updatedCount++;
            });

            console.info(`Affinity ACL backfill complete: ${updatedCount} groups updated`);

            await db.setSchemaVersion(23);
            console.info("Database schema upgrade from version 22 to 23 completed successfully");
        } else {
            console.info(
                `Skipping schema upgrade v23: current version is ${schemaVersion}, expected 22`,
            );
        }
    } catch (error) {
        console.error("Database schema upgrade from version 22 to 23 failed:", error);
        throw error;
    }
}
