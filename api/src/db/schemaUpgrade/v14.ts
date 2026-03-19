import { DbService } from "../db.service";
import { DocType } from "../../enums";
import { randomUUID } from "crypto";

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
export default async function v14(db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion !== 13) {
            console.info(
                `Skipping schema upgrade v13: current version is ${schemaVersion}, expected 12`,
            );
            return;
        }

        console.info("Upgrading database schema from version 12 to 13");

        // Add authProvider + globalConfig ACL entries to all group docs
        let groupsUpdated = 0;

                const ftsData = computeFtsData(doc);
                if (ftsData) {
                    doc.fts = ftsData.fts;
                    doc.ftsTokenCount = ftsData.ftsTokenCount;
                    // Use insertDoc to preserve the existing updatedTimeUtc
                    await db.insertDoc(doc);
                    indexedCount++;
                } else {
                    skippedCount++;
                }
            });

            if (modified) {
                await db.insertDoc(doc);
                groupsUpdated++;
            }
        });

        // Add authProviderConfig ACL entries to all group docs
        await db.processAllDocs([DocType.Group], async (doc: any) => {
            if (!doc || !Array.isArray(doc.acl)) return;

            const groupIds = [...new Set(doc.acl.map((a: any) => a.groupId))] as string[];
            let modified = false;

            groupIds.forEach((groupId) => {
                const hasAuthProviderConfig = doc.acl.some(
                    (a: any) => a.type === DocType.AuthProviderConfig && a.groupId === groupId,
                );
                if (!hasAuthProviderConfig) {
                    const permission =
                        groupId === "group-super-admins"
                            ? ["view", "edit", "delete", "assign"]
                            : ["view"];
                    doc.acl.push({ type: DocType.AuthProviderConfig, groupId, permission });
                    modified = true;
                }
            });

            if (modified) {
                await db.insertDoc(doc);
                groupsUpdated++;
            }
        });

        console.info(`ACL migration complete: ${groupsUpdated} group(s) updated`);

        // Migrate AuthProvider docs: extract sensitive fields into AuthProviderConfig docs
        let providersUpdated = 0;
        let configsCreated = 0;

        await db.processAllDocs([DocType.AuthProvider], async (doc: any) => {
            if (!doc) return;

            const hasConfigFields =
                doc.claimNamespace !== undefined ||
                doc.groupMappings !== undefined ||
                doc.userFieldMappings !== undefined;

            if (hasConfigFields) {
                const configDoc: any = {
                    _id: randomUUID(),
                    type: DocType.AuthProviderConfig,
                    providerId: doc._id,
                    memberOf: Array.isArray(doc.memberOf) ? [...doc.memberOf] : [],
                    updatedTimeUtc: doc.updatedTimeUtc ?? Date.now(),
                };

                if (doc.claimNamespace !== undefined) configDoc.claimNamespace = doc.claimNamespace;
                if (doc.groupMappings !== undefined) configDoc.groupMappings = doc.groupMappings;
                if (doc.userFieldMappings !== undefined) configDoc.userFieldMappings = doc.userFieldMappings;

                await db.insertDoc(configDoc);
                configsCreated++;

                delete doc.claimNamespace;
                delete doc.groupMappings;
                delete doc.userFieldMappings;
                await db.insertDoc(doc);
                providersUpdated++;
            }
        });

        console.info(
            `AuthProvider split complete: ${providersUpdated} provider(s) updated, ${configsCreated} config doc(s) created`,
        );

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

        await db.setSchemaVersion(14);
        console.info("Database schema upgrade from version 13 to 14 completed successfully");
    } catch (error) {
        console.error("Database schema upgrade from version 13 to 14 failed:", error);
        throw error;
    }
}
