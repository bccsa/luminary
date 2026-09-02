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

        // Media files go only when the user asked for them in the delete
        // confirmation. Opt-in because it is irreversible and because the
        // collection may be referenced somewhere this API cannot see; the previous
        // document is the authority on where the files are, and the incoming one
        // carries the intent.
        if (doc.media?.deleteFiles) {
            warnings.push(
                ...(await deleteMediaCollection(prevDoc?.media, prevDoc?.mediaBucketId, db)),
            );
        }

        // Sidecars are children of this document — nothing else references them and
        // no client holds a copy, so they go with it. Hard delete, no DeleteCmd. A
        // failure here must not block the content delete: an orphaned sidecar is
        // unreadable once the parent is gone (GET /sidecar 404s), so warn rather
        // than throw, matching deleteImage's precedent.
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

    // Process media
    if (doc.media) {
        // The bucket is where the encoder was told to write, and is what a later
        // edit of the collection has to be pointed back at — so it is required
        // for a collection in our own storage, and meaningless for one that is
        // not. A YouTube link, or an HLS master on someone else's CDN, has no
        // bucket to be relative to and nothing here to migrate or delete;
        // demanding one records a bucket that does not own anything.
        //
        // Asked of the configured buckets rather than assumed from the shape of
        // the URL: an absolute URL under a bucket's public URL is ours, and is
        // exactly the case that must not be saved without naming its bucket —
        // stored un-relative, it breaks the moment that bucket is renamed.
        if (doc.media.hlsUrl && !doc.mediaBucketId) {
            const buckets = await db.getDocsByType(DocType.Storage);
            const publicUrls = buckets.docs.map((b: any) => b.publicUrl);

            if (isInOurStorage(doc.media.hlsUrl, publicUrls)) {
                throw new Error("Bucket is not specified for media processing.");
            }
        }

        // A bucket change has to take the files with it. `mediaBucketId` and
        // `hlsUrl` must name the same bucket: if they diverge, the collection can no
        // longer be resolved from the URL, and deleting the document then leaves the
        // files behind for good.
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

        // A failed key store must fail the change request, not become a warning: the
        // plaintext key exists only for the duration of this request (processMedia has
        // already dropped it by the time the error is caught), so saving the Post with
        // an `hlsUrl` and no `hlsKey_id` would leave an unplayable, unrecoverable
        // collection. Let it throw — processChangeRequest has no catch here, so the CR
        // fails and the editor still holds the key to retry.
        warnings.push(...(await processMedia(doc.media, doc, db)));
    }

    // A key that was referenced and no longer is has been removed by the editor —
    // whether they cleared the key field or the whole media object. Outside the
    // `if (doc.media)` block on purpose: removing the collection drops doc.media
    // entirely, which is the case a check inside processMedia would never see. A
    // fresh hlsKey in the same request means replace, not delete — processMedia
    // has already recreated the sidecar at the same id. See ADR 0019.
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
