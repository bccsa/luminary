import { MediaDto } from "../../dto/MediaDto";
import { DbService } from "../../db/db.service";
import { storeCryptoData } from "../../util/encryption";
import { toStoredMediaUrl } from "./mediaUrl";

/**
 * Processes the media object on a content parent document.
 *
 * Media is an HLS collection produced by the Luminary Media Convert desktop app.
 * That app writes to the storage bucket itself, so there is nothing to upload here —
 * the document carries a URL to a collection this API never handles the bytes of on
 * the way in.
 *
 * What this function handles is the decryption key. It arrives once, on the change
 * request that first saves the collection, and is stored as a crypto object so it
 * never rests in plain text on the content document.
 *
 * Moving and removing the collection are the caller's, in `processPostTagDto`:
 * `migrateMediaCollection` on a bucket change and `deleteMediaCollection` when the
 * document is deleted and the user asked for the files to go with it.
 */
export async function processMedia(
    media: MediaDto,
    db: DbService,
    bucketId?: string,
): Promise<string[]> {
    const warnings: string[] = [];

    // Stored relative to the bucket the document already names, so the two
    // cannot disagree later. External URLs are left alone — see mediaUrl.ts.
    if (media.hlsUrl && bucketId) {
        try {
            const result = await db.getDoc(bucketId);
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
        media.hlsKey_id = await storeCryptoData<string>(db, media.hlsKey);
    } catch (error) {
        throw new Error(`Failed to encrypt the HLS key: ${error.message}`);
    } finally {
        // Dropped whether or not it was stored, and before the caller can catch:
        // a key that failed to encrypt must not reach the document either.
        delete media.hlsKey;
    }

    return warnings;
}
