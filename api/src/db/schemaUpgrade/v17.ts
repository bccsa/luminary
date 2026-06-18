import { DbService } from "../db.service";
import { DocType } from "../../enums";
import { generateThumbHash } from "../../changeRequests/documentProcessing/thumbHash";

/**
 * Upgrade the database schema from version 15/16 to 17.
 *
 * Backfills ThumbHash placeholders for pre-existing images. ThumbHash (a ~25-byte base64 blurred
 * preview, see `ImageFileCollectionDto.thumbHash`) is only generated at image-upload time
 * (`processImageDto`), so images created before that feature shipped have none. Re-encoding needs the
 * actual image bytes, which are fetched over HTTP from each image's public URL
 * (`${StorageDto.publicUrl}/${filename}`, the same URL the clients render from) — so the upgrade needs
 * no S3 credentials and can't be blocked by a bucket whose keys have since rotated.
 *
 * For each Post/Tag whose image collections are missing a ThumbHash, it fetches the smallest stored
 * variant from that doc's storage bucket (smallest is enough — `generateThumbHash` downscales to
 * ≤100×100), encodes the hash, re-saves the parent, and re-denormalises `imageData` onto every child
 * Content doc's `parentImageData` (mirroring `processPostTagDto`). Each `upsertDoc` bumps
 * `updatedTimeUtc`, so clients re-sync and finally show blurs for old content.
 *
 * Resilience: a single image that can't be fetched/encoded is logged and skipped — it must not brick
 * API startup forever (an object could be missing from storage or the URL unreachable). A DB-level
 * failure (querying/writing docs) is re-thrown to halt the upgrade so the version stays at the prior
 * value and the next startup retries. The per-collection `thumbHash` skip keeps that retry cheap and
 * idempotent.
 *
 * Accepts version 15 or 16: v16 (slug invariant cleanup) runs immediately before v17 in the chain,
 * so a fully-upgraded DB reaches v17 from 16; the 15 case covers DBs that predate v16.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion !== 15 && schemaVersion !== 16) {
            console.info(
                `Skipping schema upgrade v17: current version is ${schemaVersion}, expected 15 or 16`,
            );
            return;
        }

        console.info(`Upgrading database schema from version ${schemaVersion} to 17`);

        const stats = {
            parentsScanned: 0,
            collectionsFilled: 0,
            parentsUpdated: 0,
            childrenUpdated: 0,
            skippedNoBucket: 0,
            failures: 0,
        };

        // Resolve a bucket's public base URL once and reuse it across the (typically many) parents
        // that share the same image bucket. A bucket with no public URL maps to undefined and is
        // skipped — there's nowhere to fetch its pixels from.
        const publicUrlCache = new Map<string, string | undefined>();
        const getPublicUrl = async (bucketId: string): Promise<string | undefined> => {
            if (publicUrlCache.has(bucketId)) return publicUrlCache.get(bucketId);
            const result = await db.getDoc(bucketId);
            const publicUrl: string | undefined = result.docs?.[0]?.publicUrl
                ? // Strip trailing slash(es) so the join below never yields a "//".
                  result.docs[0].publicUrl.replace(/\/+$/, "")
                : undefined;
            publicUrlCache.set(bucketId, publicUrl);
            return publicUrl;
        };

        for (const docType of [DocType.Post, DocType.Tag]) {
            const { docs } = await db.getDocsByType(docType);

            for (const parent of docs) {
                stats.parentsScanned++;

                const collections = parent.imageData?.fileCollections;
                if (!collections?.length) continue;

                // Only collections that have stored files but no placeholder yet.
                const missing = collections.filter((c: any) => !c.thumbHash && c.imageFiles?.length);
                if (!missing.length) continue;

                if (!parent.imageBucketId) {
                    console.warn(
                        `Skipping ${parent._id}: ${missing.length} collection(s) need a ThumbHash but the parent has no imageBucketId`,
                    );
                    stats.skippedNoBucket++;
                    continue;
                }

                const baseUrl = await getPublicUrl(parent.imageBucketId);
                if (!baseUrl) {
                    console.warn(
                        `Skipping ${parent._id}: storage bucket ${parent.imageBucketId} has no public URL to fetch images from`,
                    );
                    stats.skippedNoBucket++;
                    continue;
                }

                let filledForParent = 0;
                for (const collection of missing) {
                    // Smallest stored variant minimises the download; the hash is identical regardless.
                    const smallest = [...collection.imageFiles].sort(
                        (a: any, b: any) => a.width - b.width,
                    )[0];

                    // Same public URL the clients render from: `${publicUrl}/${filename}`.
                    const url = `${baseUrl}/${smallest.filename}`;

                    try {
                        const response = await fetch(url);
                        if (!response.ok) {
                            console.error(
                                `Failed to fetch image for ${parent._id} from ${url}: HTTP ${response.status} ${response.statusText}`,
                            );
                            stats.failures++;
                            continue;
                        }

                        const buffer = Buffer.from(await response.arrayBuffer());
                        const hash = await generateThumbHash(buffer);
                        if (!hash) {
                            console.warn(
                                `ThumbHash generation produced nothing for ${parent._id} / ${smallest.filename}`,
                            );
                            stats.failures++;
                            continue;
                        }
                        collection.thumbHash = hash;
                        filledForParent++;
                        stats.collectionsFilled++;
                    } catch (err) {
                        console.error(
                            `Failed to generate ThumbHash for ${parent._id} from ${url}: ${err.message}`,
                        );
                        stats.failures++;
                    }
                }

                if (!filledForParent) continue;

                // Persist the parent (bumps updatedTimeUtc -> clients re-sync).
                await db.upsertDoc(parent);
                stats.parentsUpdated++;

                // Re-denormalise onto child Content docs, mirroring processPostTagDto.
                const children = await db.getContentByParentId(parent._id);
                for (const child of children.docs) {
                    child.parentImageData = parent.imageData;
                    await db.upsertDoc(child);
                    stats.childrenUpdated++;
                }
            }
        }

        console.info(
            `ThumbHash backfill: scanned ${stats.parentsScanned} parent(s); filled ${stats.collectionsFilled} collection(s) across ${stats.parentsUpdated} parent(s); re-synced ${stats.childrenUpdated} child content doc(s); ${stats.skippedNoBucket} skipped (no bucket); ${stats.failures} failure(s).`,
        );

        await db.setSchemaVersion(17);
        console.info(
            `Database schema upgrade from version ${schemaVersion} to 17 completed successfully`,
        );
    } catch (error) {
        console.error("Database schema upgrade to version 17 failed:", error);
        throw error;
    }
}
