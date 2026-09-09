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
 * Processes the media object on a content parent: stores the URL relative to its
 * bucket, and turns a submitted `hlsKey` into a masked sidecar so the raw key never
 * rests on the document (ADR 0019). Moving and removing the collection belong to
 * the caller, in `processPostTagDto`.
 */
export async function processMedia(
    media: MediaDto,
    parent: PostDto | TagDto,
    db: DbService,
): Promise<string[]> {
    const warnings: string[] = [];

    // Only ever read on the delete request that carries it, so it is dropped here
    // like `hlsKey` below. Stored, it is copied onto every child's `parentMedia`
    // and a later delete inherits an intent nobody expressed.
    delete media.deleteFiles;

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
