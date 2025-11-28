import { DbService } from "./db.service";
import v1 from "./schemaUpgrade/v1";
import v2 from "./schemaUpgrade/v2";
import v3 from "./schemaUpgrade/v3";
import v4 from "./schemaUpgrade/v4";
import v5 from "./schemaUpgrade/v5";
import v6 from "./schemaUpgrade/v6";
import v7 from "./schemaUpgrade/v7";
import v8 from "./schemaUpgrade/v8";

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

    // Upgrade from schema version 2 to 3
    await v3(db);

    // Upgrade from schema version 3 to 4
    await v4(db);

    // Upgrade from schema version 4 to 5
    await v5(db);

    // Upgrade from schema version 5 to 6
    await v6(db);

    // Upgrade from schema version 6 to 7
    await v7(db);

    // Upgrade from schema version 7 to 8
    await v8(db);
}
