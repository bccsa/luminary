import { ContentDto } from "../../dto/ContentDto";
import { PostDto } from "../../dto/PostDto";
import { TagDto } from "../../dto/TagDto";
import { DbService } from "../../db/db.service";
import { DocType, Uuid } from "../../enums";
import { processImage } from "./processImageDto";
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
    prevDoc: PostDto | TagDto,
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
        if (doc.imageData) {
            const imageWarnings = await processImage(
                { fileCollections: [] },
                prevDoc?.imageData,
                db,
                prevDoc?.imageBucketId, // Delete from the bucket where files currently exist
            );
            if (imageWarnings && imageWarnings.length > 0) {
                warnings.push(...imageWarnings);
            }
        }

        // Remove medias from S3
        if (doc.media) {
            const mediaWarnings = await processMedia(
                { fileCollections: [] },
                prevDoc?.media,
                db,
                prevDoc?.mediaBucketId, // Delete from the bucket where files currently exist
            );
            if (mediaWarnings && mediaWarnings.length > 0) {
                warnings.push(...mediaWarnings);
            }
        }

        return warnings; // no need to process further
    }

    // Process image uploads
    if (doc.imageData) {
        const imageWarnings: string[] = [];

        if (!doc.imageBucketId) {
            imageWarnings.push("Bucket is not specified for image processing.");
        }

        // Use the new bucket processing with db service for bucket lookup
        try {
            const warnings = await processImage(
                doc.imageData,
                prevDoc?.imageData,
                db,
                doc.imageBucketId,
                prevDoc?.imageBucketId, // Pass previous bucket ID for migration
            );
            imageWarnings.push(...warnings);
        } catch (error) {
            imageWarnings.push(`Bucket image processing failed: ${error.message}`);
        }

        if (imageWarnings && imageWarnings.length > 0) {
            warnings.push(...imageWarnings);
        }
        delete (doc as any).image; // Remove the legacy image field
    }

    // Process media uploads
    if (doc.media) {
        let mediaWarnings: string[] = [];

        // Check if bucket is specified for this upload
        if (!doc.mediaBucketId) {
            throw new Error("Bucket is not specified for media processing.");
        }

        // Use the new bucket processing with db service for bucket lookup
        try {
            mediaWarnings = await processMedia(
                doc.media,
                prevDoc?.media,
                db,
                doc.mediaBucketId,
                prevDoc?.mediaBucketId, // Pass previous bucket ID for migration
            );
        } catch (error) {
            mediaWarnings.push(`Bucket media processing failed: ${error.message}`);
        }

        if (mediaWarnings && mediaWarnings.length > 0) {
            warnings.push(...mediaWarnings);
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
