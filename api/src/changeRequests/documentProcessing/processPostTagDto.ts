import { ContentDto } from "../../dto/ContentDto";
import { PostDto } from "../../dto/PostDto";
import { TagDto } from "../../dto/TagDto";
import { DbService } from "../../db/db.service";
import { DocType, SidecarType, Uuid } from "../../enums";
import { deleteImage, processImage } from "./processImageDto";
import { processMedia } from "./processMediaDto";
import { deleteMediaCollection } from "./deleteMediaCollection";
import { migrateMediaCollection } from "./migrateMediaCollection";
import { isInOurStorage } from "./mediaUrl";
import { StorageDto } from "../../dto/StorageDto";
import {
    deleteSidecar,
    deleteSidecarsForParent,
    syncSidecarMemberOf,
} from "../../sidecar/sidecar.service";

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

        // Opt-in from the delete confirmation: irreversible, and the collection may be
        // referenced somewhere this API cannot see. prevDoc knows where the files are.
        if (doc.media?.deleteFiles) {
            warnings.push(
                ...(await deleteMediaCollection(prevDoc?.media, prevDoc?.mediaBucketId, db)),
            );
        }

        // Sidecars go with their parent (hard delete, no DeleteCmd). Warn rather than
        // block the delete, as deleteImage does: an orphan is unreadable anyway.
        try {
            await deleteSidecarsForParent(db, doc._id);
        } catch (error) {
            warnings.push(`Failed to delete sidecars for ${doc._id}: ${error.message}`);
        }

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

    if (doc.media) {
        // A collection in our own storage must name its bucket: that is how the URL is
        // stored relative, migrated and deleted. External media has no bucket to name.
        if (doc.media.hlsUrl && !doc.mediaBucketId) {
            const buckets = await db.getDocsByType(DocType.Storage);
            const publicUrls = buckets.docs.map((b: StorageDto) => b.publicUrl);

            if (isInOurStorage(doc.media.hlsUrl, publicUrls)) {
                throw new Error("Bucket is not specified for media processing.");
            }
        }

        // A bucket change takes the files with it: `mediaBucketId` and `hlsUrl` must
        // name the same bucket, or a later delete cannot find the collection.
        if (prevDoc?.mediaBucketId && prevDoc.mediaBucketId !== doc.mediaBucketId) {
            const migration = await migrateMediaCollection(
                doc.media,
                prevDoc.media?.hlsUrl,
                prevDoc.mediaBucketId,
                doc.mediaBucketId,
                db,
            );
            warnings.push(...migration.warnings);

            if (migration.failed) {
                doc.mediaBucketId = prevDoc.mediaBucketId;
                warnings.push(
                    "Media migration failed. Reverted to previous bucket configuration to ensure files remain accessible.",
                );
            }
        }

        // Deliberately not caught: the plaintext key exists only for this request, so a
        // saved `hlsUrl` without its `hlsKey_id` would be unrecoverable. Failing the
        // change request leaves the editor holding the key to retry.
        warnings.push(...(await processMedia(doc.media, doc, db)));
    }

    // Outside `if (doc.media)`: removing the whole media object removes the key too.
    // A fresh `hlsKey` in the same request is a replacement processMedia has already
    // stored at the same sidecar id (ADR 0019).
    if (prevDoc?.media?.hlsKey_id && !doc.media?.hlsKey_id && !doc.media?.hlsKey) {
        await deleteSidecar(db, doc._id, SidecarType.HlsEncryptionKey);
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
        contentDoc.parentAuthorType = doc.authorType;

        if (doc.linkDates) contentDoc.parentLinkDates = true;
        else delete contentDoc.parentLinkDates;
        await db.upsertDoc(contentDoc);
    }

    // Re-stamp the parent's memberOf onto its sidecars (same groups as the parent);
    // run on every save, not just media changes.
    await syncSidecarMemberOf(db, doc);

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
