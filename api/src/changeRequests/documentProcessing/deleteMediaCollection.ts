import { MediaDto } from "../../dto/MediaDto";
import { DbService } from "../../db/db.service";
import { S3Service } from "../../s3/s3.service";
import { isBucketRelative } from "./mediaUrl";

/**
 * Where a collection lives in its bucket, or why we will not touch it.
 *
 * A refusal is not an error: it is the safe answer for a URL we cannot prove we
 * wrote, and the caller reports it as a warning rather than failing the request.
 */
export type PrefixResolution = { prefix: string } | { refusal: string };

/**
 * The encoder names every collection prefix after its session id.
 *
 * Checked because `hlsUrl` is an editable field: someone can paste a URL naming a
 * shared folder, and "delete everything under it" would then be a data-loss bug
 * wearing a tick box. A collection this API did not produce is one it must not
 * remove — and every collection the encoder has ever written satisfies this.
 */
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the encoder publishes at the root of a collection. */
const MASTER = "/master.m3u8";

/**
 * Turn a published `hlsUrl` into the object prefix holding that collection.
 *
 * The guard falls out of the arithmetic rather than being bolted on: the only way
 * to get an object key from a public URL is to strip the bucket's own public base
 * from it, so a URL that does not start with that base cannot be resolved at all.
 * That is precisely the "never delete a prefix we did not create" rule, and unlike
 * a marker object it also protects every collection already in a bucket.
 */
export function resolveCollectionPrefix(
    hlsUrl: string | undefined,
    publicUrl: string | undefined,
): PrefixResolution {
    if (!hlsUrl) return { refusal: "the document has no media URL" };

    // Query strings and fragments are addressing, not location.
    const url = hlsUrl.split(/[?#]/)[0];

    // A relative URL is already a key: it says where in this document's bucket
    // the collection is and nothing else, so there is no public base to strip
    // and no way for the two to disagree.
    let key: string;
    if (isBucketRelative(url)) {
        key = url.slice(1);
    } else {
        if (!publicUrl) {
            return { refusal: "the bucket has no public URL configured" };
        }
        const base = publicUrl.replace(/\/+$/, "");
        // The separator has to be part of the match, or a bucket published at
        // `https://cdn/media` would claim URLs belonging to `https://cdn/media-archive`.
        if (!url.startsWith(`${base}/`)) {
            return {
                refusal: `the media URL is not in this bucket (expected it to start with ${base}/)`,
            };
        }
        key = url.slice(base.length + 1);
    }

    // Named before the suffix check below, which would otherwise report a master
    // at the bucket root as "not a master playlist" — true but unhelpful for the
    // one input where being clear matters most.
    if (key === MASTER.slice(1)) return { refusal: "the media URL names the bucket root" };

    if (!key.endsWith(MASTER)) {
        return {
            refusal: `the media URL does not name a master playlist (expected it to end with ${MASTER})`,
        };
    }

    const prefix = key.slice(0, -MASTER.length);
    if (!prefix) return { refusal: "the media URL names the bucket root" };

    // A traversal cannot reach outside the bucket, but it can certainly reach a
    // sibling prefix, and there is no legitimate reason for one to be here.
    const segments = prefix.split("/");
    if (segments.some((s) => s === "" || s === "." || s === "..")) {
        return { refusal: `the media URL has a suspicious path (${prefix})` };
    }

    const last = segments[segments.length - 1];
    if (!SESSION_ID.test(last)) {
        return {
            refusal:
                `the media URL was not written by the encoder — its last folder ` +
                `(${last}) is not a session id, so this API did not create it`,
        };
    }

    return { prefix };
}

/**
 * Delete the collection a document points at, if we can prove we wrote it.
 *
 * Best-effort by design, matching how images are handled: the caller is deleting a
 * document, and refusing to do that because a bucket was unreachable would be
 * worse than leaving objects behind. Everything that goes wrong comes back as a
 * warning the CMS shows, and every key removed is logged first — the first real
 * deletion in any bucket should be auditable after the fact.
 */
export async function deleteMediaCollection(
    media: MediaDto | undefined,
    bucketId: string | undefined,
    db: DbService,
): Promise<string[]> {
    const warnings: string[] = [];

    if (!media?.hlsUrl) return warnings;
    if (!bucketId) {
        warnings.push(
            "Media files were not deleted: the document has no storage bucket. " +
                "Please remove them on the storage provider.",
        );
        return warnings;
    }

    let bucket: { publicUrl?: string; name?: string };
    try {
        const result = await db.getDoc(bucketId);
        if (!result.docs?.length) {
            warnings.push(
                `Media files were not deleted: bucket ${bucketId} no longer exists. ` +
                    "Please remove them on the storage provider.",
            );
            return warnings;
        }
        bucket = result.docs[0];
    } catch (error) {
        warnings.push(`Media files were not deleted: ${error.message}`);
        return warnings;
    }

    const resolved = resolveCollectionPrefix(media.hlsUrl, bucket.publicUrl);
    if ("refusal" in resolved) {
        warnings.push(
            `Media files were not deleted because ${resolved.refusal}. ` +
                "Please remove them on the storage provider if they are no longer needed.",
        );
        return warnings;
    }

    try {
        const s3 = await S3Service.create(bucketId, db);
        const keys = await s3.listObjectsUnder(`${resolved.prefix}/`);

        if (keys.length === 0) {
            // Already gone, or never uploaded. Not worth a warning: the caller
            // asked for the files to be absent and they are.
            return warnings;
        }

        // Named before removal, so a deletion that turns out to be wrong can be
        // reconstructed from the log rather than guessed at.
        console.log(
            `Deleting ${keys.length} media object(s) under ${resolved.prefix}/ ` +
                `in bucket ${bucket.name ?? bucketId}: ${keys.join(", ")}`,
        );

        // Batched: removeObjects takes a list, and a collection can run to
        // hundreds of objects. 1000 is the S3 API's own limit per call.
        for (let i = 0; i < keys.length; i += 1000) {
            await s3.removeObjects(keys.slice(i, i + 1000));
        }
    } catch (error) {
        warnings.push(
            `Some media files could not be deleted from storage: ${error.message}. ` +
                "Please check the storage provider.",
        );
    }

    return warnings;
}
