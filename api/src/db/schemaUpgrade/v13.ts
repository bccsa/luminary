import { DbService } from "../db.service";
import { DocType } from "../../enums";

/**
 * Upgrade the database schema from version 12 to 13.
 *
 * - Adds authProvider and globalConfig ACL entries to all group documents.
 *   - authProvider: super-admins get full access; all other groups get view only.
 *   - globalConfig: super-admins get view + edit only (no other groups).
 * - Initialises the identities[] array on all User documents.
 *   Existing users with a userId field cannot be automatically linked to a specific provider,
 *   so they receive an empty identities array. A warning is logged for each such user so that
 *   an administrator can perform manual linking if needed.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion !== 12) {
            console.info(`Skipping schema upgrade v13: current version is ${schemaVersion}, expected 12`);
            return;
        }

        console.info("Upgrading database schema from version 12 to 13");

        // Add authProvider + globalConfig ACL entries to all group docs
        let groupsUpdated = 0;

        await db.processAllDocs([DocType.Group], async (doc: any) => {
            if (!doc || !Array.isArray(doc.acl)) return;

            const groupIds = [...new Set(doc.acl.map((a: any) => a.groupId))] as string[];
            let modified = false;

            groupIds.forEach((groupId) => {
                // Add authProvider ACL if missing
                const hasAuthProvider = doc.acl.some(
                    (a: any) => a.type === DocType.AuthProvider && a.groupId === groupId,
                );
                if (!hasAuthProvider) {
                    const permission =
                        groupId === "group-super-admins"
                            ? ["view", "edit", "delete", "assign"]
                            : ["view"];
                    doc.acl.push({ type: DocType.AuthProvider, groupId, permission });
                    modified = true;
                }

                // Add globalConfig ACL to super-admins only
                if (groupId === "group-super-admins") {
                    const hasGlobalConfig = doc.acl.some(
                        (a: any) => a.type === DocType.GlobalConfig && a.groupId === groupId,
                    );
                    if (!hasGlobalConfig) {
                        doc.acl.push({
                            type: DocType.GlobalConfig,
                            groupId,
                            permission: ["view", "edit"],
                        });
                        modified = true;
                    }
                }
            });

            if (modified) {
                await db.insertDoc(doc);
                groupsUpdated++;
            }
        });

        console.info(`ACL migration complete: ${groupsUpdated} group(s) updated`);

        // Initialise identities[] on all User docs
        let usersInitialised = 0;
        let usersWarned = 0;

        await db.processAllDocs([DocType.User], async (doc: any) => {
            if (!doc || Array.isArray(doc.identities)) return;

            if (doc.userId) {
                console.warn(
                    `User ${doc._id} (${doc.email}) has a legacy userId ("${doc.userId}") but no identities[]. ` +
                        `Initialising identities to [] – manual identity linking required for this user.`,
                );
                usersWarned++;
            }

            doc.identities = [];
            await db.insertDoc(doc);
            usersInitialised++;
        });

        console.info(
            `User identities[] initialisation complete: ${usersInitialised} document(s) updated, ${usersWarned} warning(s) issued.`,
        );

        await db.setSchemaVersion(13);
        console.info("Database schema upgrade from version 12 to 13 completed successfully");
    } catch (error) {
        console.error("Database schema upgrade from version 12 to 13 failed:", error);
        throw error;
    }
}
