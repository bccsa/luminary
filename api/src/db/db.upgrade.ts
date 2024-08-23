import { PostDto } from "../dto/PostDto";
import { DbService } from "./db.service";
import { TagDto } from "../dto/TagDto";
let db: DbService;

/**
 * Upgrade the database schema
 * @param dbService
 * @returns
 */
export async function upgradeDbSchema(dbService: DbService) {
    // There are some considerations with this upgrade method:
    // If there are several instances of the API, they will all try to upgrade the database schema at the same time if they are all started at the same time.
    // It might be needed to add a lock mechanism to prevent this.

    if (!db) {
        db = dbService;
    }

    // Upgrade from schema version 0 to 1
    const schemaVersion = await db.getSchemaVersion();
    if (schemaVersion == 0) {
        console.info("Upgrading database schema from version 0 to 1");

        // Rename fields replicated from PostDto / TagDto to ContentDto to include the "parent" prefix
        // (The "memberOf" field is excluded as it is used in database queries in the same way as the parent's field)
        await db.processAllDocs(async (doc: any) => {
            if (!doc) {
                return;
            }

            if (doc.error) {
                console.error(`Unable to parse document: ${doc.parseError}`);
                return;
            }

            if (doc.type && doc.type == "content") {
                // get the parent document
                const parentDoc = await db.getDoc(doc.parentId);

                if (!parentDoc || !parentDoc.docs || parentDoc.docs.length == 0) {
                    console.error(
                        `Unable to upgrade content document with id "${doc._id}": Parent document not found.`,
                    );
                    return;
                }

                if (parentDoc && parentDoc.docs && parentDoc.docs.length > 0) {
                    const parent: PostDto | TagDto = parentDoc.docs[0];

                    // Set replicated fields
                    doc.parentTags = parent.tags;
                    doc.parentImage = parent.image;

                    if (parent.type == "tag") {
                        const tag = parent as TagDto;
                        doc.parentTagType = tag.tagType;
                    }

                    // Clear old fields
                    delete doc.tags;
                    delete doc.image;
                    delete doc.tagType;
                }

                await db.upsertDoc(doc);

                return;
            }
        });

        await db.setSchemaVersion(1);

        console.info("Database schema upgrade from version 0 to 1 completed");
    }
}
