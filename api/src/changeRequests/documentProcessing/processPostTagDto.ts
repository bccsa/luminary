import { ContentDto } from "../../dto/ContentDto";
import { PostDto } from "../../dto/PostDto";
import { TagDto } from "../../dto/TagDto";
import { DbService } from "../../db/db.service";
import { DocType, Uuid } from "../../enums";
import { deleteImage, processImage } from "./processImageDto";
import { processMedia } from "./processMediaDto";

/**
 * Process Post / Tag DTO
 * @param doc
 * @param prevDoc
 * @param db
 * @param s3
 * @returns warnings from image processing
 */
export default async function processPostTagDto(
    doc: PostDto | TagDto,
    prevDoc: PostDto | TagDto | undefined,
    db: DbService,
): Promise<string[]> {
    const warnings: string[] = [];

    // Cascade delete for Post and Tag documents to content documents
    if (doc.deleteReq) {
        const contentDocs = await db.getContentByParentId(doc._id);
        for (const contentDoc of contentDocs.docs) {
            contentDoc.deleteReq = true;
            await db.upsertDoc(contentDoc);
        }

        // Remove images from S3
        if (doc.imageData && prevDoc?.imageData) {
            const imageWarnings = await deleteImage(prevDoc.imageData, prevDoc.imageBucketId, db);
            warnings.push(...imageWarnings);
        }

        // Media is an HLS collection written to the bucket by the encoder, not by
        // this API, and nothing here tracks which objects belong to it. Deleting the
        // document therefore leaves the collection in place, to be reclaimed by
        // stale-collection cleanup rather than guessed at from a URL.

        return warnings; // no need to process further
    }

    // Process image uploads
    if (doc.imageData) {
        let imageWarnings: string[] = [];

        if (!doc.imageBucketId) {
            imageWarnings.push("Bucket is not specified for image processing.");
        }

        // prevDoc is undefined on first upsert. A duplication request must include
        // existing file references and a source bucket on the parent document.
        if (!prevDoc && doc.imageData.duplicate) {
            const hasSourceFiles = doc.imageData.fileCollections?.some(
                (collection) => collection.imageFiles?.length > 0,
            );
            if (!doc.imageBucketId || !hasSourceFiles) {
                imageWarnings.push("Image duplication request is invalid.");
                delete doc.imageData.duplicate;
                doc.imageData.fileCollections = [];
            }
        }

        // Use the new bucket processing with db service for bucket lookup
        try {
            const result = await processImage(
                doc.imageData,
                prevDoc?.imageData,
                db,
                doc.imageBucketId,
                prevDoc?.imageBucketId, // Pass previous bucket ID for migration
            );
            imageWarnings = result.warnings;

            // If migration failed, revert to the old bucket ID to keep files accessible
            if (result.migrationFailed && prevDoc?.imageBucketId) {
                doc.imageBucketId = prevDoc.imageBucketId;
                warnings.push(
                    "Image migration failed. Reverted to previous bucket configuration to ensure files remain accessible.",
                );
            }
        } catch (error) {
            // If processing throws an error, also revert bucket ID
            if (prevDoc?.imageBucketId && doc.imageBucketId !== prevDoc.imageBucketId) {
                doc.imageBucketId = prevDoc.imageBucketId;
            }
            imageWarnings.push(`Bucket image processing failed: ${error.message}`);
        }

        if (imageWarnings && imageWarnings.length > 0) {
            warnings.push(...imageWarnings);
        }
        delete (doc as any).image; // Remove the legacy image field
    }

    // Process media
    if (doc.media) {
        // The bucket is where the encoder was told to write, and is what a later
        // edit of the collection has to be pointed back at.
        if (!doc.mediaBucketId) {
            throw new Error("Bucket is not specified for media processing.");
        }

        try {
            warnings.push(...(await processMedia(doc.media, db)));
        } catch (error) {
            warnings.push(`Media processing failed: ${error.message}`);
        }
    }

    // Get content documents that are children of the Post / Tag document
    // and copy essential properties from the Post / Tag document to the child content document
    const contentDocs = await db.getContentByParentId(doc._id);
    for (const contentDoc of contentDocs.docs) {
        contentDoc.memberOf = doc.memberOf;
        contentDoc.parentTags = doc.tags;
        contentDoc.parentImageData = doc.imageData;
        contentDoc.parentImageBucketId = doc.imageBucketId;
        contentDoc.parentMedia = doc.media;
        contentDoc.parentMediaBucketId = doc.mediaBucketId;

        if (doc.type == DocType.Post) {
            contentDoc.parentPostType = (doc as PostDto).postType;
        }

        if (doc.type == DocType.Tag) {
            contentDoc.parentTagType = (doc as TagDto).tagType;
            contentDoc.parentPinned = (doc as TagDto).pinned;
        }

        contentDoc.parentPublishDateVisible = doc.publishDateVisible;
        contentDoc.parentShowComingSoon = doc.showComingSoon ?? false;

        if (doc.alwaysOffline) contentDoc.parentAlwaysOffline = true;
        else delete contentDoc.parentAlwaysOffline;
        contentDoc.parentUseVerticalTileLayout = doc.useVerticalTileLayout ?? false;
        await db.upsertDoc(contentDoc);
    }

    // tag caching to the taggedDocs / parentTaggedDocs property of tag / content documents. This is done to improve client query performance.
    const addedTags = prevDoc ? doc.tags.filter((tag) => !prevDoc.tags.includes(tag)) : doc.tags;
    const removedTags = prevDoc ? prevDoc.tags.filter((tag) => !doc.tags.includes(tag)) : [];
    const changedTags = addedTags
        .concat(removedTags)
        .filter((tag, index, self) => self.indexOf(tag) === index);
    const tagDocs = changedTags.length ? (await db.getDocs(changedTags, [DocType.Tag])).docs : [];
    const tagDocsContent = changedTags.length
        ? (await db.getContentByParentId(changedTags)).docs
        : [];
    const updatedDocs = tagDocs.concat(tagDocsContent);

    for (const d of updatedDocs) {
        let taggedDocsArray: Uuid[];
        let tagId: Uuid;
        if (d.type == DocType.Tag) {
            const tag = d as TagDto;
            tag.taggedDocs = tag.taggedDocs || [];
            taggedDocsArray = tag.taggedDocs;
            tagId = tag._id;
        } else {
            const content = d as ContentDto;
            content.parentTaggedDocs = content.parentTaggedDocs || [];
            taggedDocsArray = content.parentTaggedDocs;
            tagId = content.parentId;
        }

        if (addedTags.includes(tagId)) taggedDocsArray.push(doc._id);

        if (removedTags.includes(tagId)) {
            const index = taggedDocsArray.indexOf(doc._id);
            if (index > -1) taggedDocsArray.splice(index, 1);
        }

        await db.upsertDoc(d);
    }

    return warnings;
}
