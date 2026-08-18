import { MediaDto } from "../../dto/MediaDto";
import { PostDto } from "../../dto/PostDto";
import { TagDto } from "../../dto/TagDto";
import { DbService } from "../../db/db.service";
import { SidecarType } from "../../enums";
import { maskKeyHex } from "../../util/maskKey";
import { sidecarId } from "../../sidecar/sidecar.service";
import { HlsEncryptionKeyData, upsertHlsKeySidecar } from "../../sidecar/hlsEncryptionKey";
import { toStoredMediaUrl } from "./mediaUrl";

/**
 * Processes the media object on a content parent document.
 *
 * Media is an HLS collection produced by the Luminary Media Convert desktop app.
 * That app writes to the storage bucket itself, so there is nothing to upload here —
 * the document carries a URL to a collection this API never handles the bytes of on
 * the way in.
 *
 * What does need handling is the decryption key. It arrives once, on the change
 * request that first saves the collection, and is stored as a masked sidecar so
 * the raw key never rests on the content document or in a log line. The sidecar
 * carries the parent's `memberOf` so the permission system gates it. See
 * docs/sidecar/04 and docs/sidecar/06.
 *
 * Moving and removing the collection are the caller's, in `processPostTagDto`:
 * `migrateMediaCollection` on a bucket change and `deleteMediaCollection` when the
 * document is deleted and the user asked for the files to go with it.
 */
export async function processMedia(
    media: MediaDto,
    parent: PostDto | TagDto,
    db: DbService,
): Promise<string[]> {
    const warnings: string[] = [];

    // Stored relative to the bucket the document already names, so the two
    // cannot disagree later. External URLs are left alone — see mediaUrl.ts.
    if (media.hlsUrl && parent.mediaBucketId) {
        try {
            const result = await db.getDoc(parent.mediaBucketId);
            const publicUrl = result.docs?.[0]?.publicUrl;
            media.hlsUrl = toStoredMediaUrl(media.hlsUrl, publicUrl) as string;
        } catch (error) {
            // Not fatal: an absolute URL still plays, and the next save
            // normalises it once the bucket is readable again.
            warnings.push(`Could not normalise the media URL: ${error.message}`);
        }
    }

    if (!media.hlsKey) return warnings;

    try {
        const seed = sidecarId(parent._id, SidecarType.HlsEncryptionKey);
        const data: HlsEncryptionKeyData = { maskedKeyHex: maskKeyHex(seed, media.hlsKey) };
        media.hlsKey_id = await upsertHlsKeySidecar(db, parent, data);
    } catch (error) {
        throw new Error(`Failed to store the HLS key: ${error.message}`);
    } finally {
        // Dropped whether or not it was stored, and before the caller can catch:
        // a key that failed to store must not reach the document either.
        delete media.hlsKey;
    }

    return warnings;
}
