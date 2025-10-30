import { ContentDto } from "../../dto/ContentDto";
import { PostDto } from "../../dto/PostDto";
import { TagDto } from "../../dto/TagDto";
import { DbService } from "../../db/db.service";
import { DocType, Uuid } from "../../enums";
import { processImage } from "../../s3/s3.imagehandling";
import { S3Service } from "../../s3/s3.service";

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
    s3: S3Service,
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
                s3,
                db,
                prevDoc?.imageBucketId, // Delete from the bucket where files currently exist
                undefined, // No migration needed for delete - pass undefined to avoid migration logic
            );
            if (imageWarnings && imageWarnings.length > 0) {
                warnings.push(...imageWarnings);
            }
        }

        return warnings; // no need to process further
    }

    // Process image uploads
    if (doc.imageData) {
        let imageWarnings: string[] = [];

        // Check if bucket is specified for this upload
        if (doc.imageBucketId && doc.imageData.uploadData) {
            // Use the new bucket-aware processing with db service for bucket lookup
            try {
                imageWarnings = await processImage(
                    doc.imageData,
                    prevDoc?.imageData,
                    s3,
                    db,
                    doc.imageBucketId,
                    prevDoc?.imageBucketId, // Pass previous bucket ID for migration
                );
            } catch (error) {
                imageWarnings.push(`Bucket-aware image processing failed: ${error.message}`);
            }
        } else {
            // Use traditional processing for backward compatibility
            imageWarnings = await processImage(
                doc.imageData,
                prevDoc?.imageData,
                s3,
                db,
                doc.imageBucketId,
                prevDoc?.imageBucketId, // Pass previous bucket ID for migration
            );
        }

        if (imageWarnings && imageWarnings.length > 0) {
            warnings.push(...imageWarnings);
        }
        delete (doc as any).image; // Remove the legacy image field
    }

    // Get content documents that are children of the Post / Tag document
    // and copy essential properties from the Post / Tag document to the child content document
    const contentDocs = await db.getContentByParentId(doc._id);
    for (const contentDoc of contentDocs.docs) {
        contentDoc.memberOf = doc.memberOf;
        contentDoc.parentTags = doc.tags;
        contentDoc.parentImageData = doc.imageData;
        contentDoc.parentImageBucketId = doc.imageBucketId;
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
