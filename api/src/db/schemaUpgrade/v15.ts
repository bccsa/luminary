import { DbService } from "../db.service";
import { DocType } from "../../enums";

/**
 * Upgrade the database schema from version 14 to 15.
 *
 * Initialises the identities[] array on all User documents.
 * Existing users with a userId field cannot be automatically linked to a
 * specific provider, so they receive an empty identities array. A warning is
 * logged for each such user so that an administrator can perform manual linking
 * if needed.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion === 14) {
            console.info("Upgrading database schema from version 14 to 15");

            let initialised = 0;
            let warned = 0;

            await db.processAllDocs([DocType.User], async (doc: any) => {
                if (!doc) return;

                // Already migrated
                if (Array.isArray(doc.identities)) return;

                if (doc.userId) {
                    console.warn(
                        `User ${doc._id} (${doc.email}) has a legacy userId ("${doc.userId}") but no identities[]. ` +
                            `Initialising identities to [] – manual identity linking required for this user.`,
                    );
                    warned++;
                }

                doc.identities = [];
                await db.insertDoc(doc);
                initialised++;
            });

            console.info(
                `User identities[] initialisation complete: ${initialised} document(s) updated, ${warned} warning(s) issued.`,
            );

            await db.setSchemaVersion(15);
            console.info("Database schema upgrade from version 14 to 15 completed successfully");
        } else {
            console.info(
                `Skipping schema upgrade v15: current version is ${schemaVersion}, expected 14`,
            );
        }
    } catch (error) {
        console.error("Database schema upgrade from version 14 to 15 failed:", error);
        throw error;
    }
}
