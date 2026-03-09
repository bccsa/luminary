import { DbService } from "./db.service";
import v10 from "./schemaUpgrade/v10";
import v11 from "./schemaUpgrade/v11";
import v12 from "./schemaUpgrade/v12";
import v13 from "./schemaUpgrade/v13";
import v14 from "./schemaUpgrade/v14";

/**
 * Upgrade the database schema
 *
 */
export async function upgradeDbSchema(db: DbService) {
    try {
        // If no schema document exists yet, create it at version 8 so the upgrade chain can run
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion === 8) {
            console.info("No schema document found, creating at version 8 to start upgrade chain");
            await db.setSchemaVersion(9);
        }

        // await v9(db);
        await v10(db);
        await v11(db);
        await v12(db);
        await v13(db);
        await v14(db);
    } catch (error) {
        console.error("Database schema upgrade failed:", error);
        throw error; // Re-throw to prevent schema version from being updated
    }
}
