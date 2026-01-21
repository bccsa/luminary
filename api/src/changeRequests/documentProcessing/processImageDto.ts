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

const imageSizes = [180, 360, 640, 1280, 2560];

const defaultImageQuality = configuration().imageProcessing.imageQuality || 80; // Default image quality for webp conversion

/**
 * Migrates all image files from one bucket to another
 * Supports migration between different S3 systems (e.g., MinIO to AWS S3, or different MinIO instances)
 * Each bucket uses its own credentials and endpoint, enabling cross-system transfers
 * Only deletes from old bucket if migration is successful
 *
 * @param image - The image DTO containing file collections to migrate
 * @param oldBucketId - The ID of the source bucket
 * @param newBucketId - The ID of the destination bucket
 * @param db - Database service to retrieve bucket configurations
 * @param s3 - S3 service for creating clients
 * @returns Array of warnings about migration status
 */
// TODO: S3Service now uses a static create() method - this function already updated to use S3Service.create()
async function migrateImagesBetweenBuckets(
    image: ImageDto,
    oldBucketId: string,
    newBucketId: string,
    db: DbService,
): Promise<string[]> {
    const warnings: string[] = [];

    try {
        // Create S3Service instances for each bucket
        const oldS3Service = await S3Service.create(oldBucketId, db);
        const newS3Service = await S3Service.create(newBucketId, db);

        // Get all image files to migrate
        const allFiles = image.fileCollections.flatMap((collection) => collection.imageFiles);

        if (allFiles.length === 0) {
            warnings.push("No image files to migrate.");
            return warnings;
        }

        const oldBucketName = oldS3Service.getBucketName();
        const newBucketName = newS3Service.getBucketName();

        let successfulMigrations = 0;
        let failedMigrations = 0;

        // Migrate each file
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
                const metadata = stat.metaData || { "Content-Type": "image/webp" };

                // Upload to new bucket
                await newS3Service.uploadFile(
                    file.filename,
                    fileBuffer,
                    metadata["Content-Type"] || "image/webp",
                );

                // Delete from old bucket only after successful upload
                await oldS3Service.getClient().removeObject(oldBucketName, file.filename);

                successfulMigrations++;
            } catch (error) {
                failedMigrations++;
                warnings.push(
                    `Failed to migrate ${file.filename} from bucket ${oldBucketName} to ${newBucketName}: ${error.message}`,
                );
            }
        }

        if (successfulMigrations > 0) {
            warnings.push(
                `Successfully migrated ${successfulMigrations} image file(s) from bucket ${oldBucketName} to ${newBucketName}`,
            );
        }

        if (failedMigrations > 0) {
            warnings.push(
                `Failed to migrate ${failedMigrations} image file(s). These files remain in the old bucket.`,
            );
        }
    } catch (error) {
        warnings.push(`Image migration failed: ${error.message}`);
    }

    return warnings;
}

/**
 * Processes an embedded image upload by resizing the image and uploading to S3
 * Requires bucket-specific credentials configured at the post/tag level
 * Bucket ID is passed from the parent post/tag document for consistency
 * Returns warnings for any issues encountered but doesn't throw errors
 */
export async function processImage(
    image: ImageDto,
    prevImage: ImageDto | undefined,
    db: DbService,
    parentBucketId?: string,
    prevParentBucketId?: string,
): Promise<string[]> {
    const warnings: string[] = [];

    try {
        // Detect bucket change and migrate images if needed
        if (
            prevImage &&
            prevParentBucketId &&
            parentBucketId &&
            prevParentBucketId !== parentBucketId &&
            image.fileCollections.length > 0
        ) {
            const migrationWarnings = await migrateImagesBetweenBuckets(
                image,
                prevParentBucketId,
                parentBucketId,
                db,
            );
            warnings.push(...migrationWarnings);
        }

        if (prevImage) {
            // Remove files that were removed from the image
            const removedFiles = prevImage.fileCollections.flatMap((collection) => {
                return collection.imageFiles.filter(
                    (file) =>
                        !image.fileCollections.some((f) =>
                            f.imageFiles.some((i) => i.filename === file.filename),
                        ),
                );
            });

            if (removedFiles.length > 0 && db && parentBucketId) {
                // Delete files from the parent's bucketId
                try {
                    const result = await db.getDoc(parentBucketId);
                    if (!result.docs || result.docs.length === 0) {
                        warnings.push(
                            `Bucket ${parentBucketId} not found. Cannot delete ${
                                removedFiles.length
                            } files. Manual cleanup required for: ${removedFiles
                                .map((f) => f.filename)
                                .join(", ")}`,
                        );
                    } else {
                        const bucketS3Service = await S3Service.create(parentBucketId, db);

                        // Delete files from the bucket
                        for (const file of removedFiles) {
                            try {
                                await bucketS3Service
                                    .getClient()
                                    .removeObject(bucketS3Service.getBucketName(), file.filename);
                            } catch (error) {
                                warnings.push(
                                    `Failed to delete ${
                                        file.filename
                                    } from bucket ${bucketS3Service.getBucketName()}: ${
                                        error.message
                                    }`,
                                );
                            }
                        }
                    }
                } catch (error) {
                    warnings.push(
                        `Failed to connect to bucket ${parentBucketId}: ${error.message}. Cannot delete ${removedFiles.length} files.`,
                    );
                }
            } else if (removedFiles.length > 0 && (!db || !parentBucketId)) {
                warnings.push(
                    `Warning: ${
                        removedFiles.length
                    } old image files cannot be automatically deleted without ${
                        !db ? "database access" : "parent bucket ID"
                    }. ` + `Please manually clean up files on the storage provider`,
                );
            }

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
                return warnings;
            }

            if (!parentBucketId) {
                warnings.push("Parent bucket ID is required for image uploads.");
                return warnings;
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
    } catch (error) {
        warnings.push(`Image processing failed: ${error.message}`);
    }
    return warnings;
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
