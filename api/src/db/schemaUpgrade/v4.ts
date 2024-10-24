import { DbService } from "../db.service";

/**
 * Upgrade the database schema from version 3 to 4
 * Add replicate pinned field from TagDto to ContentDto
 */
export default async function (db: DbService) {
    const schemaVersion = await db.getSchemaVersion();
    if (schemaVersion == 3) {
        console.info("Upgrading database schema from version 3 to 4");

        await db.processAllDocs(async (doc: any) => {
            if (!doc) {
                return;
            }

            if (doc.error) {
                console.error(`Unable to parse document: ${doc.parseError}`);
                return;
            }

            // Convert the TagDto pinned field from boolean to number
            if (doc.type && doc.type == "tag") {
                doc.pinned = doc.pinned ? 1 : 0;
                await db.upsertDoc(doc);
            }

            // Set the ContentDto parentPinned field
            if (doc.type && doc.type == "content" && doc.parentType == "tag") {
                // Get the parent document
                const parentDoc = await db.getDoc(doc.parentId);

                if (parentDoc.docs.length) doc.parentPinned = parentDoc.docs[0].pinned ? 1 : 0;

                await db.upsertDoc(doc);
            }
        });

        await db.setSchemaVersion(4);

        console.info("Database schema upgrade from version 3 to 4 completed");
    }
}
