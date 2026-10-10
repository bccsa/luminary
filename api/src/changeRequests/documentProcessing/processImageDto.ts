import { ImageFileDto } from "../../dto/ImageFileDto";
import { ImageDto } from "../../dto/ImageDto";
import * as sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import { S3Service } from "../../s3/s3.service";
import { ImageUploadDto } from "../../dto/ImageUploadDto";
import { ImageFileCollectionDto } from "../../dto/ImageFileCollectionDto";
import { DbService } from "../../db/db.service";
import { StorageDto } from "../../dto/StorageDto";
import { DocType } from "../../enums";
import configuration from "../../configuration";
import { extname } from "path";
import { generateThumbHash } from "./thumbHash";

async function deleteImageFilesFromBucket(
    files: ImageFileDto[],
    bucketId: string | undefined,
    db: DbService,
): Promise<string[]> {
    const warnings: string[] = [];

    if (files.length === 0) {
        return warnings;
    }

    if (!db || !bucketId) {
        warnings.push(
            `Warning: ${files.length} image file(s) cannot be automatically deleted without ${
                !db ? "database access" : "parent bucket ID"
            }. ` + `Please manually clean up files on the storage provider`,
        );
        return warnings;
    }

    try {
        const result = await db.getDoc(bucketId);
        if (!result.docs || result.docs.length === 0) {
            warnings.push(
                `Bucket ${bucketId} not found. Cannot delete ${
                    files.length
                } files. Manual cleanup required for: ${files.map((f) => f.filename).join(", ")}`,
            );
        } else {
            const bucketS3Service = await S3Service.create(bucketId, db);

            for (const file of files) {
                try {
                    await bucketS3Service
                        .getClient()
                        .removeObject(bucketS3Service.getBucketName(), file.filename);
                } catch (error) {
                    warnings.push(
                        `Failed to delete ${
                            file.filename
                        } from bucket ${bucketS3Service.getBucketName()}: ${error.message}`,
                    );
                }
            }
        }
    } catch (error) {
        warnings.push(
            `Failed to connect to bucket ${bucketId}: ${error.message}. Cannot delete ${files.length} files.`,
        );
    }

    return warnings;
}

/**
 * Deletes all image files referenced by the DTO from the given storage bucket.
 * Use for full removal (e.g. document delete) without a previous-document diff; also used internally when files are removed from a collection.
 */
export async function deleteImage(
    image: ImageDto,
    bucketId: string | undefined,
    db: DbService,
): Promise<string[]> {
    const files = image.fileCollections.flatMap((collection) => collection.imageFiles);
    return deleteImageFilesFromBucket(files, bucketId, db);
}

const imageSizes = [180, 360, 640, 1280, 2560];

const defaultImageQuality = configuration().imageProcessing.imageQuality || 80; // Default image quality for webp conversion

/**
 * The source-bucket cleanup a completed migration leaves for the caller. Run it once
 * the document has been written, never before: its failure costs storage, running it
 * early costs the files.
 */
export type ImageMigrationCleanup = () => Promise<string[]>;

/**
 * Moves all image files of a collection from one bucket to another. Each bucket uses its
 * own credentials and endpoint, so this works across S3 systems (MinIO → AWS S3, or
 * between MinIO instances).
 *
 * Copies the whole collection before anything is removed, and hands the source deletion
 * back as `removeSource` for the caller to run after the document is written. A copy that
 * fails leaves every file where it is, so the caller can revert `imageBucketId` to a bucket
 * that still holds them.
 *
 * @param image - The image DTO containing file collections to migrate
 * @param oldBucketId - The ID of the source bucket
 * @param newBucketId - The ID of the destination bucket
 * @param db - Database service to retrieve bucket configurations
 */
async function migrateImagesBetweenBuckets(
    image: ImageDto,
    oldBucketId: string,
    newBucketId: string,
    db: DbService,
): Promise<{ failed: boolean; warnings: string[]; removeSource?: ImageMigrationCleanup }> {
    const warnings: string[] = [];

    try {
        // Create S3Service instances for each bucket
        const oldS3Service = await S3Service.create(oldBucketId, db);
        const newS3Service = await S3Service.create(newBucketId, db);

        // Get all image files to migrate
        const allFiles = image.fileCollections.flatMap((collection) => collection.imageFiles);

        if (allFiles.length === 0) {
            warnings.push("No image files to migrate.");
            return { failed: false, warnings };
        }

        const oldBucketName = oldS3Service.getBucketName();
        const newBucketName = newS3Service.getBucketName();

        const copied: string[] = [];

        // Copy first, whole collection. A partial move is the one outcome there is no
        // recovery from: the caller reverts the bucket on failure, and a bucket missing
        // half its files is a reverted document with broken images.
        for (const file of allFiles) {
            try {
                // Download from old bucket
                const fileStream = await oldS3Service.getObject(file.filename);
                const chunks: Uint8Array[] = [];

                // Collect all chunks
                await new Promise<void>((resolve, reject) => {
                    fileStream.on("data", (chunk: Uint8Array) => chunks.push(chunk));
                    fileStream.on("end", () => resolve());
                    fileStream.on("error", (err) => reject(err));
                });

                const fileBuffer = Buffer.concat(chunks);

                // Get metadata from old bucket (need to use getClient for statObject)
                const stat = await oldS3Service
                    .getClient()
                    .statObject(oldBucketName, file.filename);
                const metadata = stat.metaData || {};

                // Upload to new bucket. S3 lowercases stored metadata keys.
                await newS3Service.uploadFile(
                    file.filename,
                    fileBuffer,
                    metadata["content-type"] || metadata["Content-Type"] || "image/webp",
                );

                copied.push(file.filename);
            } catch (error) {
                warnings.push(
                    `Failed to migrate ${file.filename} from bucket ${oldBucketName} to ${newBucketName}: ${error.message}`,
                );
                warnings.push(
                    `Image migration stopped after ${copied.length} of ${allFiles.length} file(s). ` +
                        `All files remain in bucket ${oldBucketName}.`,
                );

                // Copies already made are left behind: a retry overwrites them, and deleting
                // on the way out risks objects we did not put there.
                return { failed: true, warnings };
            }
        }

        // Handed to the caller instead of run here: its failure is not the migration's
        // failure, and leftovers in the old bucket cost storage, not a broken image.
        const removeSource: ImageMigrationCleanup = async () => {
            const cleanupWarnings: string[] = [];

            for (const filename of copied) {
                try {
                    await oldS3Service.getClient().removeObject(oldBucketName, filename);
                } catch (error) {
                    cleanupWarnings.push(
                        `${filename} was copied to bucket ${newBucketName} but could not be removed ` +
                            `from bucket ${oldBucketName}: ${error.message}. Please remove it on the ` +
                            "storage provider.",
                    );
                }
            }

            return cleanupWarnings;
        };

        warnings.push(
            `Successfully migrated ${copied.length} image file(s) from bucket ${oldBucketName} to ${newBucketName}`,
        );

        return { failed: false, warnings, removeSource };
    } catch (error) {
        warnings.push(`Image migration failed: ${error.message}`);
        return { failed: true, warnings };
    }
}

/**
 * Processes an embedded image upload by resizing the image and uploading to S3
 * Requires bucket-specific credentials configured at the post/tag level
 * Bucket ID is passed from the parent post/tag document for consistency
 *
 * Returns the migration failure status, any warnings, and — when a bucket change moved the
 * files — the `removeSource` cleanup the caller must run after the document is written.
 */
export async function processImage(
    image: ImageDto,
    prevImage: ImageDto | undefined,
    db: DbService,
    parentBucketId?: string,
    prevParentBucketId?: string,
): Promise<{
    migrationFailed: boolean;
    warnings: string[];
    removeSource?: ImageMigrationCleanup;
}> {
    const warnings: string[] = [];
    let migrationFailed = false;
    let duplicatedNow = false;
    let removeSource: ImageMigrationCleanup | undefined;

    try {
        if (image.duplicate && image.fileCollections.length > 0) {
            const prevHasImageFiles = !!prevImage?.fileCollections?.some(
                (collection) => collection.imageFiles?.length > 0,
            );

            if (prevHasImageFiles) {
                image.fileCollections = prevImage.fileCollections;
            } else {
                if (!parentBucketId) {
                    warnings.push("Parent bucket ID is required for duplicated image copy.");
                    return { migrationFailed, warnings, removeSource };
                }

                const duplicateResult = await duplicateImageFilesWithoutReencoding(
                    image,
                    db,
                    parentBucketId,
                    parentBucketId,
                );
                warnings.push(...duplicateResult.warnings);

                if (!duplicateResult.success) {
                    // Avoid persisting stale source filenames when copy fails.
                    image.fileCollections = [];
                    delete image.duplicate;
                    return { migrationFailed, warnings, removeSource };
                }
                duplicatedNow = true;
            }
        }

        // Detect bucket change and migrate images if needed
        if (
            prevImage &&
            prevParentBucketId &&
            parentBucketId &&
            prevParentBucketId !== parentBucketId &&
            image.fileCollections.length > 0
        ) {
            const migrationResult = await migrateImagesBetweenBuckets(
                image,
                prevParentBucketId,
                parentBucketId,
                db,
            );
            warnings.push(...migrationResult.warnings);
            migrationFailed = migrationResult.failed;
            removeSource = migrationResult.removeSource;
        }

        // Skipped when the duplicate copy just authored the collections (a retry after a
        // failed first copy has a prevImage with EMPTY collections — reconciling against
        // it would wipe the files the copy just created).
        if (prevImage && !duplicatedNow) {
            // Remove files that were removed from the image
            const removedFiles = prevImage.fileCollections.flatMap((collection) => {
                return collection.imageFiles.filter(
                    (file) =>
                        !image.fileCollections.some((f) =>
                            f.imageFiles.some((i) => i.filename === file.filename),
                        ),
                );
            });

            const removalWarnings = await deleteImageFilesFromBucket(
                removedFiles,
                parentBucketId,
                db,
            );
            warnings.push(...removalWarnings);

            // Remove file objects that were added to the image: Only the API may add image files. A client can occasionally submit "new" image files,
            // but this usually will happen if an offline client saved changes to an image which had file objects removed by another client.
            // When the offline client comes online, it's change request will then contain file objects that were previously removed, and
            // as such need to be ignored.
            image.fileCollections = prevImage.fileCollections.filter((collection) =>
                // Only include collections from the previous document
                image.fileCollections.some((c) =>
                    c.imageFiles.some((f) => collection.imageFiles[0]?.filename === f.filename),
                ),
            );
        }

        // Upload new files
        if (image.uploadData) {
            if (!db) {
                warnings.push("Unable to upload images - system configuration error.");
                return { migrationFailed, warnings, removeSource };
            }

            if (!parentBucketId) {
                warnings.push("Parent bucket ID is required for image uploads.");
                return { migrationFailed, warnings, removeSource };
            }

            const promises: Promise<{ success: boolean; warnings: string[] }>[] = [];
            image.uploadData?.forEach((uploadData) => {
                promises.push(processImageUpload(uploadData, image, db, parentBucketId));
            });

            const results = await Promise.all(promises);

            // Collect all warnings from uploads
            results.forEach((result) => {
                warnings.push(...result.warnings);
            });

            // If any uploads failed completely, we should clean up any successful uploads
            const successfulUploads = results.filter((r) => r.success).length;
            const failedUploads = results.filter((r) => !r.success).length;

            if (failedUploads > 0) {
                warnings.push(`${failedUploads} of ${results.length} image uploads failed`);

                if (successfulUploads === 0) {
                    warnings.push("All image uploads failed - no images were processed"); // Throw error if ALL failed
                }
            }

            delete image.uploadData; // Remove upload data after processing
        }

        delete image.duplicate;
    } catch (error) {
        warnings.push(`Image processing failed: ${error.message}`);
    }

    return { migrationFailed, warnings, removeSource };
}

async function duplicateImageFilesWithoutReencoding(
    image: ImageDto,
    db: DbService,
    sourceBucketId: string,
    targetBucketId: string,
): Promise<{ success: boolean; warnings: string[] }> {
    const warnings: string[] = [];

    try {
        const sourceS3Service = await S3Service.create(sourceBucketId, db);
        const targetS3Service = await S3Service.create(targetBucketId, db);
        const sourceBucketName = sourceS3Service.getBucketName();

        const copiedCollections: ImageFileCollectionDto[] = [];
        for (const collection of image.fileCollections) {
            const copiedCollection = new ImageFileCollectionDto();
            copiedCollection.aspectRatio = collection.aspectRatio;
            copiedCollection.thumbHash = collection.thumbHash; // carry the placeholder over unchanged
            copiedCollection.imageFiles = [];

            for (const imageFile of collection.imageFiles) {
                const stream = await sourceS3Service.getObject(imageFile.filename);
                const chunks: Uint8Array[] = [];
                await new Promise<void>((resolve, reject) => {
                    stream.on("data", (chunk: Uint8Array) => chunks.push(chunk));
                    stream.on("end", () => resolve());
                    stream.on("error", (err) => reject(err));
                });
                const fileBuffer = Buffer.concat(chunks);
                const stat = await sourceS3Service
                    .getClient()
                    .statObject(sourceBucketName, imageFile.filename);
                const contentType = stat.metaData?.["Content-Type"] || "image/webp";

                const copiedImageFile = new ImageFileDto();
                copiedImageFile.width = imageFile.width;
                copiedImageFile.height = imageFile.height;
                const originalExtension = extname(imageFile.filename) || ".webp";
                copiedImageFile.filename = `${uuidv4()}${originalExtension}`;

                await targetS3Service.uploadFile(copiedImageFile.filename, fileBuffer, contentType);
                copiedCollection.imageFiles.push(copiedImageFile);
            }

            copiedCollections.push(copiedCollection);
        }

        image.fileCollections = copiedCollections;
        return { success: true, warnings };
    } catch (error) {
        warnings.push(`Failed to duplicate image files without re-encoding: ${error.message}`);
        return { success: false, warnings };
    }
}

async function processImageUpload(
    uploadData: ImageUploadDto,
    image: ImageDto,
    db: DbService,
    bucketId: string,
): Promise<{ success: boolean; warnings: string[] }> {
    const warnings: string[] = [];

    try {
        let preset = uploadData?.preset || "default";
        if (
            preset != "default" &&
            preset != "photo" &&
            preset != "picture" &&
            preset != "drawing" &&
            preset != "icon" &&
            preset != "text"
        ) {
            preset = "default";
        }

        const promises: Promise<any>[] = [];

        const metadata = await sharp(uploadData.fileData).metadata();

        const resultImageCollection = new ImageFileCollectionDto();
        resultImageCollection.aspectRatio =
            Math.round((metadata.width / metadata.height) * 100) / 100;

        // Blurred placeholder the client shows instantly (and offline) while the full image loads.
        resultImageCollection.thumbHash = await generateThumbHash(uploadData.fileData);

        // Bucket ID is required
        if (!bucketId) {
            return {
                success: false,
                warnings: [
                    "No bucket specified for image upload. Each post/tag must specify a target bucket with proper credentials.",
                ],
            };
        }

        // Look up the bucket and create bucket-specific S3 client
        let storage: StorageDto;

        try {
            const bucketDocs = await db.getDocsByType(DocType.Storage);
            const foundBucket = bucketDocs.docs.find(
                (doc: any) => doc._id === bucketId,
            ) as StorageDto;

            if (!foundBucket || !foundBucket.name) {
                return {
                    success: false,
                    warnings: [
                        `Bucket with ID ${bucketId} not found. Please configure a storage bucket with proper credentials before uploading images.`,
                    ],
                };
            }

            storage = foundBucket;

            // Validate file type against bucket's allowed mimeTypes (if specified)
            // Use Sharp's detected format to determine mimetype
            if (storage.mimeTypes && storage.mimeTypes.length > 0 && metadata.format) {
                const detectedFormat = metadata.format === "jpeg" ? "jpg" : metadata.format;
                const detectedMimetype = `image/${detectedFormat}`;
                const detectedMimetypeAlt = `image/${metadata.format}`;

                const isAllowed = storage.mimeTypes.some((allowedType) => {
                    // Support wildcards like "image/*"
                    if (allowedType.endsWith("/*")) {
                        const prefix = allowedType.slice(0, -2);
                        return (
                            detectedMimetype.startsWith(prefix + "/") ||
                            detectedMimetypeAlt.startsWith(prefix + "/")
                        );
                    }
                    // Exact match (check both variants for jpg/jpeg)
                    return detectedMimetype === allowedType || detectedMimetypeAlt === allowedType;
                });

                if (!isAllowed) {
                    return {
                        success: false,
                        warnings: [
                            `File type "${detectedMimetype}" is not allowed for bucket "${
                                storage.name
                            }". Allowed types: ${storage.mimeTypes.join(", ")}`,
                        ],
                    };
                }
            }

            // Create bucket-specific S3 service with bucket's credentials
            const s3Service = await S3Service.create(bucketId, db);

            imageSizes.forEach(async (size) => {
                if (metadata.width < size / 1.1) return; // allow slight upscaling
                promises.push(
                    resizeAndUploadImage(
                        uploadData,
                        size,
                        s3Service,
                        defaultImageQuality,
                        preset,
                        resultImageCollection,
                    ),
                );
            });

            // Fallback: store at original size if image is smaller than all target sizes
            if (promises.length === 0 && metadata.width > 0) {
                promises.push(
                    resizeAndUploadImage(
                        uploadData,
                        metadata.width,
                        s3Service,
                        defaultImageQuality,
                        preset,
                        resultImageCollection,
                    ),
                );
            }
        } catch (error) {
            throw error; // Rethrow connection/lookup errors
        }

        const results = await Promise.all(promises);

        // Check if any quality processing failed
        const failedResults = results.filter((r) => !r.success);
        if (failedResults.length > 0) {
            warnings.push(`${failedResults.length} image sizes failed to process`);
            failedResults.forEach((r) => warnings.push(...r.warnings));
        }

        // Only add the image collection if at least some sizes were processed successfully
        const successfulResults = results.filter((r) => r.success);
        if (successfulResults.length > 0) {
            image.fileCollections.push(resultImageCollection);
            return { success: true, warnings };
        } else {
            return {
                success: false,
                warnings: ["No image sizes could be processed successfully"],
            };
        }
    } catch (error) {
        return { success: false, warnings: [`Image upload failed: ${error.message}`] };
    }
}

async function resizeAndUploadImage(
    uploadData: ImageUploadDto,
    size: number,
    s3Service: S3Service,
    imageQuality: number,
    preset: keyof sharp.PresetEnum,
    resultImageCollection: ImageFileCollectionDto,
): Promise<{ success: boolean; warnings: string[] }> {
    try {
        const resized = await sharp(uploadData.fileData)
            .resize(size)
            .webp({
                quality: imageQuality,
                preset: preset,
            })
            .toBuffer({ resolveWithObject: true });

        const imageFile = new ImageFileDto();
        imageFile.width = resized.info.width;
        imageFile.height = resized.info.height;
        imageFile.filename = uuidv4() + ".webp";

        // Save resized image to S3
        await s3Service.uploadFile(imageFile.filename, resized.data, "image/webp");

        resultImageCollection.imageFiles.push(imageFile);

        return { success: true, warnings: [] };
    } catch (error) {
        return { success: false, warnings: [`Failed to resize/upload image: ${error.message}`] };
    }
}
