import { DbService } from "./db.service";
import initSchemaVersion from "./schemaUpgrade/initSchemaVersion";
import v9 from "./schemaUpgrade/v9";
import v10 from "./schemaUpgrade/v10";
import v11 from "./schemaUpgrade/v11";
import v12 from "./schemaUpgrade/v12";
import v13 from "./schemaUpgrade/v13";
import v14 from "./schemaUpgrade/v14";
import v15 from "./schemaUpgrade/v15";
import v16 from "./schemaUpgrade/v16";
import v17 from "./schemaUpgrade/v17";
import v18 from "./schemaUpgrade/v18";
import v19 from "./schemaUpgrade/v19";

// Re-exported for convenience so callers can read the fresh-DB baseline version from this module.
export { FRESH_DB_SCHEMA_VERSION } from "./schemaUpgrade/freshDbSchemaVersion";

/**
 * Upgrade the database schema
 *
 */
export async function upgradeDbSchema(db: DbService) {
    try {
        // Default startup initializer: stamp a fresh database at the latest version so the version
        // is tracked and any future upgrade fires from the right baseline. No-op on existing DBs.
        await initSchemaVersion(db);
        await v9(db);
        await v10(db);
        await v11(db);
        await v12(db);
        await v13(db);
        await v14(db);
        await v15(db);
        await v16(db);
        await v17(db);
        await v18(db);
        await v19(db);
    } catch (error) {
        console.error("Database schema upgrade failed:", error);
        throw error; // Re-throw to prevent schema version from being updated
    }
}
