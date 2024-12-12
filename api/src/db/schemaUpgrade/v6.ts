import { DbService } from "../db.service";
import { DocType, Uuid } from "../../enums";
import { TagDto } from "../../dto/TagDto";
import { ContentDto } from "../../dto/ContentDto";

/**
 * Upgrade the database schema from version 5 to 6
 * Update image field to imageData field in PostDto and TagDto documents and upload images to S3
 */
export default async function (db: DbService) {
    const schemaVersion = await db.getSchemaVersion();
    if (schemaVersion == 5) {
        console.info("Upgrading database schema from version 5 to 6");

        await db.processAllDocs([DocType.Post, DocType.Tag], async (doc: any) => {
            // tag caching to the taggedDocs / parentTaggedDocs property of tag / content documents. This is done to improve client query performance.

            if (doc) {
                const tagDocs = doc.tags.length
                    ? (await db.getDocs(doc.tags, [DocType.Tag])).docs
                    : [];
                const tagDocsContent = doc.tags.length
                    ? (await db.getContentByParentId(doc.tags)).docs
                    : [];
                const updateDocs = tagDocs.concat(tagDocsContent);

                for (const d of updateDocs) {
                    let taggedDocs: Uuid[];
                    if (d.type == DocType.Tag) {
                        const tag = d as TagDto;
                        tag.taggedDocs = tag.taggedDocs || [];
                        taggedDocs = tag.taggedDocs;
                    } else {
                        const content = d as ContentDto;
                        content.parentTaggedDocs = content.parentTaggedDocs || [];
                        taggedDocs = content.parentTaggedDocs;
                    }

                    if (!taggedDocs.includes(doc._id)) {
                        taggedDocs.push(doc._id);
                        await db.upsertDoc(d);
                    }
                }
            }
        });

        await db.setSchemaVersion(6);
        console.info("Database schema upgrade from version 5 to 6 completed");
    }
}
