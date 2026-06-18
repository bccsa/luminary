import { DbService } from "../db.service";
import { DocType } from "../../enums";
import { S3Service } from "../../s3/s3.service";
import { generateThumbHash } from "../../changeRequests/documentProcessing/thumbHash";

/**
 * Upgrade the database schema from version 15/16 to 17.
 *
 * Backfills ThumbHash placeholders for pre-existing images. ThumbHash (a ~25-byte base64 blurred
 * preview, see `ImageFileCollectionDto.thumbHash`) is only generated at image-upload time
 * (`processImageDto`), so images created before that feature shipped have none. Re-encoding needs the
 * actual image bytes, which are pulled from S3 per bucket.
 *
 * For each Post/Tag whose image collections are missing a ThumbHash, it fetches the smallest stored
 * variant from that doc's bucket (smallest is enough — `generateThumbHash` downscales to ≤100×100),
 * encodes the hash, re-saves the parent, and re-denormalises `imageData` onto every child Content
 * doc's `parentImageData` (mirroring `processPostTagDto`). Each `upsertDoc` bumps `updatedTimeUtc`,
 * so clients re-sync and finally show blurs for old content.
 *
 * Resilience: a single image that can't be fetched/encoded is logged and skipped — it must not brick
 * API startup forever (an object could be missing from S3). A DB-level failure (querying/writing
 * docs) is re-thrown to halt the upgrade so the version stays at the prior value and the next startup
 * retries. The per-collection `thumbHash` skip keeps that retry cheap and idempotent.
 *
 * Accepts version 15 or 16: v16 is reserved by a parallel branch. Until that lands and bumps the
 * schema to 16, v17 runs straight after v15; once it does, v17 picks up from 16.
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

                let s3: S3Service;
                try {
                    s3 = await S3Service.create(parent.imageBucketId, db);
                } catch (err) {
                    console.error(
                        `Skipping ${parent._id}: could not open bucket ${parent.imageBucketId}: ${err.message}`,
                    );
                    stats.failures++;
                    continue;
                }

                let filledForParent = 0;
                for (const collection of missing) {
                    // Smallest stored variant minimises the download; the hash is identical regardless.
                    const smallest = [...collection.imageFiles].sort(
                        (a: any, b: any) => a.width - b.width,
                    )[0];

                    try {
                        const buffer = await streamToBuffer(await s3.getObject(smallest.filename));
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
                            `Failed to generate ThumbHash for ${parent._id} / ${smallest.filename}: ${err.message}`,
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

/** Collect a Minio object stream into a single Buffer. */
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    await new Promise<void>((resolve, reject) => {
        stream.on("data", (chunk: Uint8Array) => chunks.push(chunk));
        stream.on("end", () => resolve());
        stream.on("error", (err) => reject(err));
    });
    return Buffer.concat(chunks);
}
