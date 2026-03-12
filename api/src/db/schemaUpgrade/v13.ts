import { DbService } from "../db.service";

/**
 * Upgrade the database schema from version 12 to 13.
 * Generates expired delete commands for all published content documents that have
 * a past expiryDate and do not already have an Expired delete command.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion === 12) {
            console.info("Upgrading database schema from version 12 to 13");

            await db.generateExpiredDeleteCmds();

            await db.setSchemaVersion(13);
            console.info("Database schema upgrade from version 12 to 13 completed successfully");
        } else {
            console.info(
                `Skipping schema upgrade v13: current version is ${schemaVersion}, expected 12`,
            );
        }
    } catch (error) {
        console.error("Database schema upgrade from version 12 to 13 failed:", error);
        throw error;
    }
}
