import { DbService } from "./db.service";
import v9 from "./schemaUpgrade/v9";
import v10 from "./schemaUpgrade/v10";
import v11 from "./schemaUpgrade/v11";

/**
 * Upgrade the database schema
 *
 */
export async function upgradeDbSchema(db: DbService) {
    try {
        await v9(db);
        await v10(db);
        await v11(db);
    } catch (error) {
        console.error("Database schema upgrade failed:", error);
        throw error; // Re-throw to prevent schema version from being updated
    }
}
