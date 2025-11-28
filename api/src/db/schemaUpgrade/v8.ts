import { DbService } from "../db.service";
import { DocType } from "../../enums";
import { GroupDto } from "../../dto/GroupDto";

/**
 * Upgrade the database schema from version 7 to 8
 * Set special memberOf field for group documents to improve database query performance
 */
export default async function (db: DbService) {
    const schemaVersion = await db.getSchemaVersion();
    if (schemaVersion == 7) {
        console.info("Upgrading database schema from version 7 to 8");

        await db.processAllDocs([DocType.Group], async (doc: GroupDto) => {
            if (doc) {
                doc.memberOf = [doc._id]; // Set special memberOf field for group documents to improve database query performance.
                await db.upsertDoc(doc);
            }
        });

        await db.setSchemaVersion(8);
        console.info("Database schema upgrade from version 7 to 8 completed");
    }
}
