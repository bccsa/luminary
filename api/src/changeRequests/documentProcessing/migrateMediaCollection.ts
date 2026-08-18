import { MediaDto } from "../../dto/MediaDto";
import { DbService } from "../../db/db.service";
import { S3Service } from "../../s3/s3.service";
import { resolveCollectionPrefix } from "./deleteMediaCollection";
import { isBucketRelative } from "./mediaUrl";

/** What the encoder publishes at the root of a collection. */
const MASTER = "master.m3u8";

/** The S3 API's own ceiling on keys per delete call. */
const DELETE_BATCH = 1000;

/**
 * Where a bucket publishes its objects, and what to call it in a warning.
 */
type Bucket = { publicUrl?: string; name?: string };

async function loadBucket(
    bucketId: string,
    db: DbService,
): Promise<{ bucket: Bucket } | { error: string }> {
    try {
        const result = await db.getDoc(bucketId);
        if (!result.docs?.length) return { error: `bucket ${bucketId} no longer exists` };
        return { bucket: result.docs[0] };
    } catch (error) {
        return { error: error.message };
    }
}

/**
 * Move a media collection from one bucket to another, then point the document at
 * its new home.
 *
 * Ordering is the whole design. Copy everything, prove every object arrived, only
 * then rewrite `hlsUrl`, and only then delete the source. A collection is not a set
 * of independent files — a master playlist without its segments is a broken video —
 * so this deliberately does not follow the per-file "upload then delete" of
 * `migrateImagesBetweenBuckets`, where a partial result costs one thumbnail.
 *
 * On any failure the caller reverts `mediaBucketId`, which is what keeps the
 * document honest: `mediaBucketId` and `hlsUrl` must always name the same bucket,
 * or a later delete cannot resolve the collection and the files leak.
 */
export async function migrateMediaCollection(
    media: MediaDto,
    previousHlsUrl: string | undefined,
    oldBucketId: string,
    newBucketId: string,
    db: DbService,
): Promise<{ failed: boolean; warnings: string[] }> {
    const warnings: string[] = [];

    if (!previousHlsUrl) return { failed: false, warnings };

    // A URL edited in the same save as a bucket change is the user repointing the
    // document by hand, not asking for a move. Moving files then overwriting their
    // edit would undo a deliberate action.
    if (media.hlsUrl && media.hlsUrl !== previousHlsUrl) {
        warnings.push(
            "The media URL and the storage bucket were changed together, so no files were " +
                "moved. Change the bucket on its own if you want the existing files migrated.",
        );
        return { failed: false, warnings };
    }

    const oldResult = await loadBucket(oldBucketId, db);
    if ("error" in oldResult) {
        warnings.push(`Media files were not moved: ${oldResult.error}.`);
        return { failed: true, warnings };
    }
    const newResult = await loadBucket(newBucketId, db);
    if ("error" in newResult) {
        warnings.push(`Media files were not moved: ${newResult.error}.`);
        return { failed: true, warnings };
    }

    const oldBucket = oldResult.bucket;
    const newBucket = newResult.bucket;

    // Only an absolute URL has to be rebuilt, and only that needs the
    // destination's public URL.
    if (!newBucket.publicUrl && !isBucketRelative(previousHlsUrl)) {
        warnings.push(
            "Media files were not moved: the destination bucket has no public URL configured, " +
                "so the new media URL cannot be built.",
        );
        return { failed: true, warnings };
    }

    // The same proof used before deleting: a prefix we cannot derive from the
    // bucket's own public base is a collection we did not write.
    const resolved = resolveCollectionPrefix(previousHlsUrl, oldBucket.publicUrl);
    if ("refusal" in resolved) {
        warnings.push(`Media files were not moved because ${resolved.refusal}.`);
        return { failed: true, warnings };
    }
    const prefix = resolved.prefix;

    try {
        const source = await S3Service.create(oldBucketId, db);
        const destination = await S3Service.create(newBucketId, db);

        const keys = await source.listObjectsUnder(`${prefix}/`);
        if (keys.length === 0) {
            warnings.push(
                `Media files were not moved: nothing was found under ${prefix}/ in ` +
                    `${oldBucket.name ?? oldBucketId}.`,
            );
            return { failed: true, warnings };
        }

        // Copy first, whole collection, streaming each object. Sequential on
        // purpose: these are large objects and the point is to keep memory flat.
        for (const key of keys) {
            const stat = await source.statObject(key);
            const stream = await source.getObject(key);
            const contentType =
                (stat.metaData && stat.metaData["content-type"]) || "application/octet-stream";

            await destination.putStream(key, stream, stat.size, contentType);

            // Verified per object rather than at the end: the size is the one thing
            // a truncated copy gets wrong, and checking it here names the object
            // that failed instead of reporting the collection as generally bad.
            const copied = await destination.statObject(key);
            if (copied.size !== stat.size) {
                throw new Error(
                    `${key} copied as ${copied.size} bytes but the source is ${stat.size}`,
                );
            }
        }

        // Only now is the new location real, so only now may the document name it.
        //
        // A relative URL already names a path inside whichever bucket the
        // document points at, so moving buckets does not change it — which is
        // the point of storing it that way. Only the legacy absolute form has
        // to be rewritten.
        if (!isBucketRelative(media.hlsUrl)) {
            media.hlsUrl = `${newBucket.publicUrl.replace(/\/+$/, "")}/${prefix}/${MASTER}`;
        }

        // Last, and its failure is not the migration's failure: the files are in
        // the new bucket and the document points at them. Leftovers in the old
        // bucket cost storage, not playback.
        try {
            console.log(
                `Moved ${keys.length} media object(s) under ${prefix}/ from ` +
                    `${oldBucket.name ?? oldBucketId} to ${newBucket.name ?? newBucketId}; ` +
                    "removing the originals",
            );
            for (let i = 0; i < keys.length; i += DELETE_BATCH) {
                await source.removeObjects(keys.slice(i, i + DELETE_BATCH));
            }
        } catch (error) {
            warnings.push(
                `Media files were copied to ${newBucket.name ?? newBucketId} but the originals ` +
                    `could not be removed from ${oldBucket.name ?? oldBucketId}: ${error.message}. ` +
                    "Please remove them on the storage provider.",
            );
        }

        warnings.push(
            `Successfully moved ${keys.length} media file(s) from ` +
                `${oldBucket.name ?? oldBucketId} to ${newBucket.name ?? newBucketId}.`,
        );
        return { failed: false, warnings };
    } catch (error) {
        // Nothing was deleted and the URL was not rewritten, so the collection is
        // still whole and still where the document says it is. Anything already
        // copied is left in place: it is unreferenced, harmless, and overwritten by
        // a retry — whereas deleting it on the way out of a failure risks removing
        // objects we did not put there.
        warnings.push(
            `Media migration failed: ${error.message}. The files were left in ` +
                `${oldBucket.name ?? oldBucketId}.`,
        );
        return { failed: true, warnings };
    }
}
