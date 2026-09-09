import { MediaDto } from "../../dto/MediaDto";
import { DbService } from "../../db/db.service";
import { S3Service } from "../../s3/s3.service";
import { MASTER, loadBucket, resolveCollectionPrefix } from "./deleteMediaCollection";
import { isBucketRelative, isInOurStorage } from "./mediaUrl";

/** The S3 API's own ceiling on keys per delete call. */
const DELETE_BATCH = 1000;

export type MediaMigrationResult = {
    failed: boolean;
    warnings: string[];
    /**
     * Deletes the objects left behind in the old bucket. Run once the document has
     * been written, never before: its failure costs storage, running it early costs
     * the collection.
     */
    removeSource?: () => Promise<string[]>;
};

/**
 * Moves a media collection between buckets and repoints the document at it. Copies
 * the whole collection before rewriting `hlsUrl`, and hands the source deletion
 * back as `removeSource` for the caller to run after the write. On failure the
 * caller reverts `mediaBucketId`, which must always name the same bucket as
 * `hlsUrl`.
 */
export async function migrateMediaCollection(
    media: MediaDto,
    previousHlsUrl: string | undefined,
    oldBucketId: string,
    newBucketId: string,
    db: DbService,
): Promise<MediaMigrationResult> {
    const warnings: string[] = [];

    if (!previousHlsUrl) return { failed: false, warnings };

    // Clearing the URL is the editor removing the media, and the move would write a
    // new one straight back over that.
    if (!media.hlsUrl) {
        warnings.push(
            "The media URL was cleared in the same save as the storage bucket, so no " +
                "files were moved.",
        );
        return { failed: false, warnings };
    }

    // A URL edited in the same save as a bucket change is the user repointing the
    // document by hand, not asking for a move. Moving files then overwriting their
    // edit would undo a deliberate action.
    if (media.hlsUrl !== previousHlsUrl) {
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

    // External media is not ours to move, and a bucket change is about where future
    // output goes; calling it a failed migration would revert a deliberate change.
    if (!isInOurStorage(previousHlsUrl, [oldBucket.publicUrl])) return { failed: false, warnings };

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

        // Only now is the new location real. A relative URL already names a path inside
        // whichever bucket the document points at; only the legacy absolute form moves.
        if (!isBucketRelative(media.hlsUrl)) {
            media.hlsUrl = `${newBucket.publicUrl.replace(/\/+$/, "")}/${prefix}${MASTER}`;
        }

        // Handed to the caller instead of run here: its failure is not the migration's
        // failure, and leftovers in the old bucket cost storage, not playback.
        const removeSource = async (): Promise<string[]> => {
            try {
                console.log(
                    `Moved ${keys.length} media object(s) under ${prefix}/ from ` +
                        `${oldBucket.name ?? oldBucketId} to ${newBucket.name ?? newBucketId}; ` +
                        "removing the originals",
                );
                for (let i = 0; i < keys.length; i += DELETE_BATCH) {
                    await source.removeObjects(keys.slice(i, i + DELETE_BATCH));
                }
                return [];
            } catch (error) {
                return [
                    `Media files were copied to ${newBucket.name ?? newBucketId} but the originals ` +
                        `could not be removed from ${oldBucket.name ?? oldBucketId}: ${error.message}. ` +
                        "Please remove them on the storage provider.",
                ];
            }
        };

        warnings.push(
            `Successfully moved ${keys.length} media file(s) from ` +
                `${oldBucket.name ?? oldBucketId} to ${newBucket.name ?? newBucketId}.`,
        );
        return { failed: false, warnings, removeSource };
    } catch (error) {
        // Nothing was deleted and the URL was not rewritten. Copies already made are
        // left: a retry overwrites them, and deleting on the way out risks objects we
        // did not put there.
        warnings.push(
            `Media migration failed: ${error.message}. The files were left in ` +
                `${oldBucket.name ?? oldBucketId}.`,
        );
        return { failed: true, warnings };
    }
}
