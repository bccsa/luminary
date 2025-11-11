import { ImageFileDto } from "../dto/ImageFileDto";
import { ImageDto } from "../dto/ImageDto";
import * as sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import { S3Service } from "./s3.service";
import { ImageUploadDto } from "../dto/ImageUploadDto";
import { ImageFileCollectionDto } from "../dto/ImageFileCollectionDto";
import { DbService } from "../db/db.service";
import { StorageDto } from "../dto/StorageDto";
import { DocType } from "../enums";
import * as Minio from "minio";
import configuration from "../configuration";

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
async function migrateImagesBetweenBuckets(
    image: ImageDto,
    oldBucketId: string,
    newBucketId: string,
    db: DbService,
    s3: S3Service,
): Promise<string[]> {
    const warnings: string[] = [];

    try {
        // Use S3Service to create clients from bucket configurations
        const { client: oldS3Client, bucketName: oldBucketName } = await s3.createClientFromBucket(
            oldBucketId,
            db,
        );
        const { client: newS3Client, bucketName: newBucketName } = await s3.createClientFromBucket(
            newBucketId,
            db,
        );

        // Get all image files to migrate
        const allFiles = image.fileCollections.flatMap((collection) => collection.imageFiles);

        if (allFiles.length === 0) {
            warnings.push("No image files to migrate.");
            return warnings;
        }

        // Note: We can't easily determine endpoints from clients, but this is for logging only
        console.log(`Initiating migration from bucket ${oldBucketName} to ${newBucketName}...`);

        let successfulMigrations = 0;
        let failedMigrations = 0;

        // Migrate each file
        for (const file of allFiles) {
            try {
                // Download from old bucket
                const fileStream = await oldS3Client.getObject(oldBucketName, file.filename);
                const chunks: Uint8Array[] = [];

                // Collect all chunks
                await new Promise<void>((resolve, reject) => {
                    fileStream.on("data", (chunk: Uint8Array) => chunks.push(chunk));
                    fileStream.on("end", () => resolve());
                    fileStream.on("error", (err) => reject(err));
                });

                const fileBuffer = Buffer.concat(chunks);

                // Get metadata from old bucket
                const stat = await oldS3Client.statObject(oldBucketName, file.filename);
                const metadata = stat.metaData || { "Content-Type": "image/webp" };

                // Upload to new bucket
                await newS3Client.putObject(
                    newBucketName,
                    file.filename,
                    fileBuffer,
                    fileBuffer.length,
                    metadata,
                );

                // Delete from old bucket only after successful upload
                await oldS3Client.removeObject(oldBucketName, file.filename);

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
    s3: S3Service,
    db?: DbService,
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
            db &&
            image.fileCollections.length > 0
        ) {
            const migrationWarnings = await migrateImagesBetweenBuckets(
                image,
                prevParentBucketId,
                parentBucketId,
                db,
                s3,
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
                        const { client: bucketS3Client, bucketName } =
                            await s3.createClientFromBucket(parentBucketId, db);

                        // Delete files from the bucket
                        for (const file of removedFiles) {
                            try {
                                await bucketS3Client.removeObject(bucketName, file.filename);
                            } catch (error) {
                                warnings.push(
                                    `Failed to delete ${file.filename} from bucket ${bucketName}: ${error.message}`,
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
                promises.push(processImageUpload(uploadData, s3, image, db, parentBucketId));
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
                    warnings.push("All image uploads failed - no images were processed");
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
    s3: S3Service,
    image: ImageDto,
    db: DbService, // Required - no longer optional
    bucketId: string, // Parent-level bucket ID
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
            warnings.push(
                "No bucket specified for image upload. Each post/tag must specify a target bucket with proper credentials.",
            );
            return { success: false, warnings };
        }

        // Look up the bucket and create bucket-specific S3 client
        let bucketDto: StorageDto;

        try {
            const bucketDocs = await db.getDocsByType(DocType.Storage);
            const foundBucket = bucketDocs.docs.find(
                (doc: any) => doc._id === bucketId,
            ) as StorageDto;

            if (!foundBucket || !foundBucket.name) {
                warnings.push(
                    `Bucket with ID ${bucketId} not found. Please configure a storage bucket with proper credentials before uploading images.`,
                );
                return { success: false, warnings };
            }

            bucketDto = foundBucket;

            // Validate file type against bucket's allowed fileTypes (if specified)
            // Use Sharp's detected format to determine mimetype
            if (bucketDto.fileTypes && bucketDto.fileTypes.length > 0 && metadata.format) {
                const detectedMimetype = `image/${metadata.format}`;
                const isAllowed = bucketDto.fileTypes.some((allowedType) => {
                    // Support wildcards like "image/*"
                    if (allowedType.endsWith("/*")) {
                        const prefix = allowedType.slice(0, -2);
                        return detectedMimetype.startsWith(prefix + "/");
                    }
                    // Exact match
                    return detectedMimetype === allowedType;
                });

                if (!isAllowed) {
                    warnings.push(
                        `File type "${detectedMimetype}" is not allowed for bucket "${
                            bucketDto.name
                        }". Allowed types: ${bucketDto.fileTypes.join(", ")}`,
                    );
                    return { success: false, warnings };
                }
            }

            // Create bucket-specific S3 client with bucket's credentials
            const { client: bucketS3Client, bucketName } = await s3.createClientFromBucket(
                bucketId,
                db,
            );

            imageSizes.forEach(async (size) => {
                if (metadata.width < size / 1.1) return; // allow slight upscaling
                promises.push(
                    resizeAndUploadImage(
                        uploadData,
                        size,
                        bucketS3Client,
                        bucketName,
                        defaultImageQuality,
                        preset,
                        resultImageCollection,
                    ),
                );
            });
        } catch (error) {
            warnings.push(
                `Failed to connect to bucket ${bucketId}: ${error.message}. Please ensure the bucket has valid credentials configured.`,
            );
            return { success: false, warnings };
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
            warnings.push("No image sizes could be processed successfully");
            return { success: false, warnings };
        }
    } catch (error) {
        warnings.push(`Image upload failed: ${error.message}`);
        return { success: false, warnings };
    }
}

async function resizeAndUploadImage(
    uploadData: ImageUploadDto,
    size: number,
    s3Client: Minio.Client,
    bucketName: string,
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
        imageFile.filename = uuidv4();

        // Save resized image to S3 using bucket-specific client
        const metadata = {
            "Content-Type": "image/webp",
        };
        await s3Client.putObject(
            bucketName,
            imageFile.filename,
            resized.data,
            resized.data.length,
            metadata,
        );

        resultImageCollection.imageFiles.push(imageFile);

        return { success: true, warnings: [] };
    } catch (error) {
        return {
            success: false,
            warnings: [`Failed to process image size ${size}px: ${error.message}\n`],
        };
    }
}
