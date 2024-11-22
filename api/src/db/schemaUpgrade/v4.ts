import { PostDto } from "../../dto/PostDto";
import { DbService } from "../db.service";
import { DocType, PostType } from "../../enums";
import { ContentDto } from "../../dto/ContentDto";

/**
 * Upgrade the database schema from version 3 to 4
 * Add a postType field to PostDto documents
 */
export default async function (db: DbService) {
    const schemaVersion = await db.getSchemaVersion();
    if (schemaVersion == 3) {
        console.info("Upgrading database schema from version 3 to 4");
        await db.processAllDocs([DocType.Post, DocType.Content], async (doc: any) => {
            if (!doc) {
                return;
            }
            if (doc.error) {
                console.error(`Unable to parse document: ${doc.parseError}`);
                return;
            }
            // Add postType field to PostDto documents
            if (doc.type && doc.type == "post" && (doc as PostDto).postType == undefined) {
                (doc as PostDto).postType = PostType.Blog;
                await db.upsertDoc(doc);
            }
            // Add parentPostType field to ContentDto documents
            if (
                doc.type &&
                doc.type == DocType.Content &&
                (doc as ContentDto).parentType == DocType.Post &&
                (doc as ContentDto).parentPostType == undefined
            ) {
                (doc as ContentDto).parentPostType = PostType.Blog;
                await db.upsertDoc(doc);
            }
        });
        await db.setSchemaVersion(4);
        console.info("Database schema upgrade from version 3 to 4 completed");
    }
}
