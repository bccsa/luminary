import { DbService } from "./db.service";
import v1 from "./schemaUpgrade/v1";
import v2 from "./schemaUpgrade/v2";

/**
 * Upgrade the database schema
 */
export async function upgradeDbSchema(db: DbService) {
    // There are some considerations with this upgrade method:
    // If there are several instances of the API, they will all try to upgrade the database schema at the same time if they are all started at the same time.
    // It might be needed to add a lock mechanism to prevent this.

    // Upgrade from schema version 0 to 1
    await v1(db);

    // Upgrade from schema version 1 to 2
    await v2(db);
}
