import { DbService } from "../db.service";
import { DocType } from "../../enums";

/**
 * Upgrade the database schema from version 9 to 10
 * Propagate media fields from Post/Tag documents to their Content children
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion === 9) {
            console.info("Upgrading database schema from version 9 to 10");

            let updatedCount = 0;
            let contentUpdatedCount = 0;

            // Process all Post and Tag documents with media data
            await db.processAllDocs([DocType.Post, DocType.Tag], async (doc: any) => {
                if (!doc) return;

                // Only process documents that have media with file collections
                const hasMediaData =
                    doc.media && doc.media.fileCollections && doc.media.fileCollections.length > 0;

                if (hasMediaData && doc.mediaBucketId) {
                    updatedCount++;

                    // Propagate media data to child content documents
                    try {
                        const childContents = await db.getContentByParentId(doc._id);
                        if (childContents.docs?.length) {
                            for (const contentDoc of childContents.docs) {
                                let contentNeedsUpdate = false;

                                // Update parentMedia if different
                                if (
                                    JSON.stringify(contentDoc.parentMedia) !==
                                    JSON.stringify(doc.media)
                                ) {
                                    contentDoc.parentMedia = doc.media;
                                    contentNeedsUpdate = true;
                                }

                                // Update parentMediaBucketId if different
                                if (contentDoc.parentMediaBucketId !== doc.mediaBucketId) {
                                    contentDoc.parentMediaBucketId = doc.mediaBucketId;
                                    contentNeedsUpdate = true;
                                }

                                if (contentNeedsUpdate) {
                                    try {
                                        await db.upsertDoc(contentDoc);
                                        contentUpdatedCount++;
                                    } catch (error) {
                                        console.error(
                                            `Failed to update content document ${contentDoc._id}:`,
                                            error,
                                        );
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`Failed to get content for parent ${doc._id}:`, error);
                    }
                }
            });

            console.info(
                `Processed ${updatedCount} Post/Tag documents with media, updated ${contentUpdatedCount} Content documents`,
            );

            await db.setSchemaVersion(10);
            console.info("Database schema upgrade from version 9 to 10 completed successfully");
        } else {
            console.info(
                `Skipping schema upgrade v10: current version is ${schemaVersion}, expected 9`,
            );
        }
    } catch (error) {
        console.error("Database schema upgrade from version 9 to 10 failed:", error);
        throw error;
    }
}
