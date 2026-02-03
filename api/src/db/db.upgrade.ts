import { DbService } from "./db.service";
import v9 from "./schemaUpgrade/v9";

/**
 * Upgrade the database schema
 *
 * Historical schema upgrades (v1-v9) have been removed as all production databases
 * are now at schema version 9. New schema upgrades should be added here when needed.
 *
 * Note: If there are several instances of the API, they will all try to upgrade
 * the database schema at the same time if they are all started at the same time.
 * It might be needed to add a lock mechanism to prevent this.
 */
export async function upgradeDbSchema(db: DbService) {
    try {
        await v9(db);
    } catch (error) {
        console.error("Database schema upgrade failed:", error);
        throw error; // Re-throw to prevent schema version from being updated
    }
}
