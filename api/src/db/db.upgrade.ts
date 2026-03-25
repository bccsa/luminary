import { DbService } from "./db.service";
import v9 from "./schemaUpgrade/v9";
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
        await v9(db);
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
