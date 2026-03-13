import { DbService } from "../db.service";
import { DocType } from "../../enums";

/**
 * Upgrade the database schema from version 12 to 13.
 * Adds authProvider permissions to all group documents.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion === 12) {
            console.info("Upgrading database schema from version 12 to 13");

            let updatedCount = 0;

            await db.processAllDocs([DocType.Group], async (doc: any) => {
                if (!doc || !Array.isArray(doc.acl)) return;

                const groupIds = [...new Set(doc.acl.map((a: any) => a.groupId))] as string[];
                let modified = false;

                groupIds.forEach((groupId) => {
                    const hasAuthProvider = doc.acl.some(
                        (a: any) => a.type === DocType.AuthProvider && a.groupId === groupId
                    );
                    
                    if (!hasAuthProvider) {
                        const permission =
                            groupId === "group-super-admins"
                                ? ["view", "edit", "delete", "assign"]
                                : ["view"];
                        doc.acl.push({
                            type: DocType.AuthProvider,
                            groupId: groupId,
                            permission: permission,
                        });
                        modified = true;
                    }
                });

                if (modified) {
                    await db.insertDoc(doc);
                    updatedCount++;
                }
            });

            console.info(`AuthProvider permission migration complete: ${updatedCount} groups updated`);

            await db.setSchemaVersion(13);
            console.info("Database schema upgrade from version 12 to 13 completed successfully");
        } else {
            console.info(
                `Skipping schema upgrade v13: current version is ${schemaVersion}, expected 12`
            );
        }
    } catch (error) {
        console.error("Database schema upgrade from version 12 to 13 failed:", error);
        throw error;
    }
}
