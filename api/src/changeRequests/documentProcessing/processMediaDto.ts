import { MediaDto } from "../../dto/MediaDto";
import { MediaUploadDataDto } from "../../dto/MediaUploadDataDto";
import { MediaFileDto } from "../../dto/MediaFileDto";
import { v4 as uuidv4 } from "uuid";
import { S3Service } from "../../s3/s3.service";
import { DbService } from "../../db/db.service";
import { StorageDto } from "../../dto/StorageDto";
import { DocType } from "../../enums";
import { getAudioFormatInfo } from "../../s3-audio/audioFormatDetection";

/**
 * Migrates all media files from one bucket to another
 * Supports migration between different S3 systems (e.g., MinIO to AWS S3, or different MinIO instances)
 * Each bucket uses its own credentials and endpoint, enabling cross-system transfers
 * Only deletes from old bucket if migration is successful
 *
 * @param media - The media DTO containing file collections to migrate
 * @param oldBucketId - The ID of the source bucket
 * @param newBucketId - The ID of the destination bucket
 * @param db - Database service to retrieve bucket configurations
 * @returns Object with migration failure status and warnings
 */
async function migrateMediaBetweenBuckets(
    media: MediaDto,
    oldBucketId: string,
    newBucketId: string,
    db: DbService,
): Promise<{ failed: boolean; warnings: string[] }> {
    const warnings: string[] = [];

    try {
        // Create S3Service instances for each bucket
        const oldS3Service = await S3Service.create(oldBucketId, db);
        const newS3Service = await S3Service.create(newBucketId, db);

        // Get all media files to migrate
        const allFiles = media.fileCollections;

        if (allFiles.length === 0) {
            warnings.push("No media files to migrate.");
            return { failed: false, warnings };
        }

        const oldBucketName = oldS3Service.getBucketName();
        const newBucketName = newS3Service.getBucketName();

        let successfulMigrations = 0;
        let failedMigrations = 0;

        // Migrate each file
        for (const fileCollection of allFiles) {
            try {
                // Extract filename from URL
                const urlParts = fileCollection.fileUrl.split("/");
                const filename = urlParts[urlParts.length - 1];

                // Download from old bucket
                const fileStream = await oldS3Service.getObject(filename);
                const chunks: Uint8Array[] = [];

                // Collect all chunks
                await new Promise<void>((resolve, reject) => {
                    fileStream.on("data", (chunk: Uint8Array) => chunks.push(chunk));
                    fileStream.on("end", () => resolve());
                    fileStream.on("error", (err) => reject(err));
                });

                const fileBuffer = Buffer.concat(chunks);

                // Get metadata from old bucket
                const stat = await oldS3Service.getClient().statObject(oldBucketName, filename);
                const metadata = stat.metaData || { "Content-Type": "audio/mpeg" };

                // Upload to new bucket
                await newS3Service.uploadFile(
                    filename,
                    fileBuffer,
                    metadata["Content-Type"] || "audio/mpeg",
                );

                // Delete from old bucket only after successful upload
                await oldS3Service.getClient().removeObject(oldBucketName, filename);

                successfulMigrations++;
            } catch (error) {
                failedMigrations++;
                warnings.push(
                    `Failed to migrate media file from bucket ${oldBucketName} to ${newBucketName}: ${error.message}`,
                );
            }
        }

        if (successfulMigrations > 0) {
            warnings.push(
                `Successfully migrated ${successfulMigrations} media file(s) from bucket ${oldBucketName} to ${newBucketName}`,
            );
        }

        if (failedMigrations > 0) {
            warnings.push(
                `Failed to migrate ${failedMigrations} media file(s). These files remain in the old bucket.`,
            );
        }

        // Migration is considered failed if ANY files failed to migrate
        return { failed: failedMigrations > 0, warnings };
    } catch (error) {
        warnings.push(`Media migration failed: ${error.message}`);
        return { failed: true, warnings };
    }
}

/**
 * Processes an embedded media upload by uploading to S3
 * Requires bucket-specific credentials configured at the post/tag level
 * Bucket ID is passed from the parent post/tag document for consistency
 * Returns object with migration failure status and warnings
 */
export async function processMedia(
    media: MediaDto,
    prevMedia: MediaDto | undefined,
    db: DbService,
    parentBucketId?: string,
    prevParentBucketId?: string,
): Promise<{ migrationFailed: boolean; warnings: string[] }> {
    const warnings: string[] = [];
    let migrationFailed = false;

    try {
        // Detect bucket change and migrate media if needed
        if (
            prevMedia &&
            prevParentBucketId &&
            parentBucketId &&
            prevParentBucketId !== parentBucketId &&
            media.fileCollections.length > 0
        ) {
            const migrationResult = await migrateMediaBetweenBuckets(
                media,
                prevParentBucketId,
                parentBucketId,
                db,
            );
            warnings.push(...migrationResult.warnings);
            migrationFailed = migrationResult.failed;
        }

        if (prevMedia) {
            // Track files to delete from S3
            const filesToDelete: string[] = [];

            // Strategy: The client sends ALL fileCollections it wants to keep
            // We need to:
            // 1. Delete files that are not in the client's list
            // 2. Discard invalid files the client may have added
            // 3. Replace files when uploading for the same language

            const languagesBeingUploaded =
                media.uploadData?.map((u) => u.languageId).filter(Boolean) || [];

            // Get fileUrls from previous media (valid files)
            const prevFileUrls = new Set(prevMedia.fileCollections.map((c) => c.fileUrl));

            // Get fileUrls that the client is keeping (only keep if they were in prevMedia)
            // BUT exclude files for languages that are being uploaded (they'll be replaced)
            const keptFileUrls = new Set(
                media.fileCollections
                    .filter((c) => {
                        // Only keep if it was in prevMedia
                        if (!prevFileUrls.has(c.fileUrl)) return false;

                        // Don't keep if its language is being replaced by an upload
                        if (languagesBeingUploaded.includes(c.languageId)) return false;

                        return true;
                    })
                    .map((c) => c.fileUrl),
            );

            // Check each previous file collection
            prevMedia.fileCollections.forEach((collection) => {
                // If the file is not in the kept list, mark it for deletion
                if (!keptFileUrls.has(collection.fileUrl)) {
                    // Extract key from URL
                    const urlParts = collection.fileUrl.split("/");
                    const key = urlParts[urlParts.length - 1];
                    if (key && key.length > 0) {
                        filesToDelete.push(key);
                    }
                }
            });

            // Delete files from S3 using the parent bucket ID
            if (filesToDelete.length > 0 && db && parentBucketId) {
                try {
                    const result = await db.getDoc(parentBucketId);
                    if (!result.docs || result.docs.length === 0) {
                        warnings.push(
                            `Bucket ${parentBucketId} not found. Cannot delete ${
                                filesToDelete.length
                            } files. Manual cleanup required for: ${filesToDelete.join(", ")}`,
                        );
                    } else {
                        const bucketS3Service = await S3Service.create(parentBucketId, db);

                        // Delete files from the bucket
                        for (const key of filesToDelete) {
                            try {
                                await bucketS3Service
                                    .getClient()
                                    .removeObject(bucketS3Service.getBucketName(), key);
                            } catch (error) {
                                warnings.push(
                                    `Failed to delete ${key} from bucket ${bucketS3Service.getBucketName()}: ${
                                        error.message
                                    }`,
                                );
                            }
                        }
                    }
                } catch (error) {
                    warnings.push(
                        `Failed to connect to bucket ${parentBucketId}: ${error.message}. Cannot delete ${filesToDelete.length} files.`,
                    );
                }
            } else if (filesToDelete.length > 0 && (!db || !parentBucketId)) {
                warnings.push(
                    `Warning: ${
                        filesToDelete.length
                    } old media files cannot be automatically deleted without ${
                        !db ? "database access" : "parent bucket ID"
                    }. ` + `Please manually clean up files on the storage provider`,
                );
            }

            // Start with only valid files that the client is keeping
            media.fileCollections = media.fileCollections.filter((c) =>
                keptFileUrls.has(c.fileUrl),
            );
        }

        // Upload new files
        if (media.uploadData) {
            if (!db) {
                warnings.push("Unable to upload media - system configuration error.");
                return { migrationFailed, warnings };
            }

            if (!parentBucketId) {
                warnings.push("Parent bucket ID is required for media uploads.");
                return { migrationFailed, warnings };
            }

            const promises: Promise<{ success: boolean; warnings: string[] }>[] = [];
            media.uploadData?.forEach((uploadData) => {
                promises.push(processMediaUpload(uploadData, media, db, parentBucketId));
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
                warnings.push(`${failedUploads} of ${results.length} media uploads failed`);

                if (successfulUploads === 0) {
                    warnings.push("All media uploads failed - no media were processed");
                }
            }

            delete media.uploadData; // Remove upload data after processing
        }
    } catch (error) {
        warnings.push(`Media processing failed: ${error.message}`);
    }

    return { migrationFailed, warnings };
}

async function processMediaUpload(
    uploadData: MediaUploadDataDto,
    media: MediaDto,
    db: DbService,
    bucketId: string,
): Promise<{ success: boolean; warnings: string[] }> {
    const warnings: string[] = [];

    try {
        let preset = uploadData?.preset || "default";
        if (preset != "default" && preset != "audio" && preset != "speech") {
            preset = "default";
        }

        // Bucket ID is required
        if (!bucketId) {
            warnings.push(
                "No bucket specified for media upload. Each post/tag must specify a target bucket with proper credentials.",
            );
            return { success: false, warnings };
        }

        // Look up the bucket and create bucket-specific S3 client
        let storage: StorageDto;

        try {
            const bucketDocs = await db.getDocsByType(DocType.Storage);
            const foundBucket = bucketDocs.docs.find(
                (doc: any) => doc._id === bucketId,
            ) as StorageDto;

            if (!foundBucket || !foundBucket.name) {
                warnings.push(
                    `Bucket with ID ${bucketId} not found. Please configure a storage bucket with proper credentials before uploading media.`,
                );
                return { success: false, warnings };
            }

            storage = foundBucket;

            // Validate file type against bucket's allowed mimeTypes (if specified)
            // Use audio format detection to determine mimetype
            if (storage.mimeTypes && storage.mimeTypes.length > 0) {
                // Parse metadata to determine format
                let detectedMimetype = "audio/mpeg"; // default

                try {
                    const { parseBuffer } = await import("music-metadata");
                    const metadata = await parseBuffer(new Uint8Array(uploadData.fileData));
                    const formatInfo = getAudioFormatInfo(metadata);
                    detectedMimetype = formatInfo.mime;
                } catch (_err) {
                    // Fall back to default
                }

                const isAllowed = storage.mimeTypes.some((allowedType) => {
                    // Support wildcards like "audio/*"
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
                            storage.name
                        }". Allowed types: ${storage.mimeTypes.join(", ")}`,
                    );
                    return { success: false, warnings };
                }
            }

            // Create bucket-specific S3 service with bucket's credentials
            const s3Service = await S3Service.create(bucketId, db);

            // Process and upload the media file
            const uploadResult = await uploadMediaFile(uploadData, s3Service, media, storage);
            warnings.push(...uploadResult.warnings);

            if (!uploadResult.success) {
                return { success: false, warnings };
            }

            return { success: true, warnings };
        } catch (error) {
            warnings.push(
                `Failed to connect to bucket ${bucketId}: ${error.message}. Please ensure the bucket has valid credentials configured.`,
            );
            return { success: false, warnings };
        }
    } catch (error) {
        warnings.push(`Media upload failed: ${error.message}`);
        return { success: false, warnings };
    }
}

async function uploadMediaFile(
    uploadData: MediaUploadDataDto,
    s3Service: S3Service,
    media: MediaDto,
    storage: StorageDto,
): Promise<{ success: boolean; warnings: string[] }> {
    const warnings: string[] = [];

    try {
        // Parse metadata to infer bitrate and format info
        let formatInfo = { ext: "", mime: "application/octet-stream", isValidAudio: false };
        let bitrate = 0;
        const u8 = new Uint8Array(uploadData.fileData);

        try {
            const { parseBuffer } = await import("music-metadata");
            const metadata = await parseBuffer(u8);

            // Use robust format detection
            formatInfo = getAudioFormatInfo(metadata);
            bitrate = Math.round(metadata.format.bitrate || 0);
        } catch (_err) {
            // Fall back; format/bitrate unknown in this environment
        }

        // Fallback to generic audio if we couldn't determine format
        if (!formatInfo.ext) {
            formatInfo.ext = "mp3"; // Use mp3 as safe default extension
            formatInfo.mime = "audio/mpeg"; // safe default
        }

        // Include file extension in the key for proper MIME type handling
        const key = `${uuidv4()}-default.${formatInfo.ext}`;

        // Upload original buffer as-is
        const buf = Buffer.from(u8);

        await s3Service.uploadFile(key, buf, formatInfo.mime);

        // Validate upload accessibility
        const validateRes = await s3Service.objectExists(key);
        if (!validateRes) {
            warnings.push("Media file uploaded but not accessible");
        }

        // Construct the public URL using the bucket's publicUrl from StorageDto
        // Remove trailing slash from publicUrl if present
        const baseUrl = storage.publicUrl.replace(/\/$/, "");
        const fileUrl = `${baseUrl}/${key}`;

        const file = new MediaFileDto();
        file.languageId = uploadData.languageId;
        file.fileUrl = fileUrl;
        file.bitrate = bitrate;
        file.mediaType = uploadData.mediaType;

        media.fileCollections.push(file);

        return { success: true, warnings };
    } catch (error) {
        return {
            success: false,
            warnings: [`Failed to upload media file: ${error.message}\n`],
        };
    }
}
