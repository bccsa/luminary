import { DbService } from "./db.service";
import v9 from "./schemaUpgrade/v9";

/**
 * Upgrade the database schema
 *
 */
export async function upgradeDbSchema(db: DbService) {
    try {
        await v9(db);
    } catch (error) {
        console.error("Database schema upgrade failed:", error);
        throw error; // Re-throw to prevent schema version from being updated
    }
}
