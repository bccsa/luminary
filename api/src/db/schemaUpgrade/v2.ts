import { DocType } from "src/enums";
import { DbService } from "../db.service";

/**
 * Upgrade the database schema from version 1 to 2
 * Add publishDateVisible field to PostDto and TagDto documents
 */
export default async function (db: DbService) {
    const schemaVersion = await db.getSchemaVersion();
    if (schemaVersion == 1) {
        console.info("Upgrading database schema from version 1 to 2");
        await db.processAllDocs([DocType.Post, DocType.Tag], async (doc: any) => {
            if (!doc) {
                return;
            }
            if (doc.error) {
                console.error(`Unable to parse document: ${doc.parseError}`);
                return;
            }
            if (doc.type && (doc.type == "post" || doc.type == "tag")) {
                if (doc.publishDateVisible != undefined) return;
                // Posts should by default show the publish date
                if (doc.type == "post") doc.publishDateVisible = true;
                // Tags should by default not show the publish date
                if (doc.type == "tag") doc.publishDateVisible = false;
                await db.upsertDoc(doc);
            }
        });
        await db.setSchemaVersion(2);
        console.info("Database schema upgrade from version 1 to 2 completed");
    }
}
