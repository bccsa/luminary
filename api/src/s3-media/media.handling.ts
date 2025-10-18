import { MediaDto } from "../dto/MediaDto";
import { MediaUploadDataDto } from "../dto/MediaUploadDataDto";
import { S3MediaService } from "./media.service";
import { MediaFileDto } from "../dto/MediaFileDto";
import { v4 as uuidv4 } from "uuid";
import { getAudioFormatInfo } from "./audioFormatDetection";

export async function processMedia(
    media: MediaDto,
    prevMedia: MediaDto | undefined,
    s3Media: S3MediaService,
): Promise<string[]> {
    const warnings: string[] = [];

    try {
        // Track files to delete from S3
        const filesToDelete: string[] = [];

        // Handle prevMedia cleanup if needed
        if (prevMedia) {
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

            // Delete files from S3
            if (filesToDelete.length > 0) {
                try {
                    await s3Media.removeObjects(s3Media.mediaBucket, filesToDelete);
                } catch (error) {
                    warnings.push(
                        `Failed to delete ${filesToDelete.length} media file(s) from storage: ${error.message}`,
                    );
                }
            }

            // Start with only valid files that the client is keeping
            media.fileCollections = media.fileCollections.filter((c) =>
                keptFileUrls.has(c.fileUrl),
            );
        }

        if (media.uploadData) {
            const promises: Promise<{ success: boolean; warnings: string[] }>[] = [];
            media.uploadData.forEach((uploadData: MediaUploadDataDto) => {
                promises.push(processMediaUploadSafe(uploadData, s3Media, media));
            });
            const results = await Promise.all(promises);

            // collect all warnings from uploads
            results.forEach((result) => {
                if (!result.success) {
                    warnings.push(...result.warnings);
                }
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
        warnings.push(`Failed to process media: ${error.message}`);
    }
    return warnings;
}

/**
 * Validate existing media files in file collections
 */
async function validateMediaInContent(
    fileCollections: any[],
    s3MediaService: S3MediaService,
    warnings: string[] = [],
): Promise<void> {
    try {
        // Extract filenames from URLs
        const allFilenames = fileCollections
            .map((f) => (typeof f.fileUrl === "string" ? f.fileUrl.split("/").pop() : undefined))
            .filter((k): k is string => !!k && k.length > 0);

        if (allFilenames.length > 0) {
            const inaccessibleMedias = await s3MediaService.checkMediaAccessibility(
                s3MediaService.mediaBucket,
                allFilenames,
            );
            if (inaccessibleMedias.length > 0) {
                warnings.push(
                    `Some media files are not accessible: ${inaccessibleMedias.join(", ")}`,
                );
            }
        }
    } catch (error) {
        warnings.push(`Failed to validate existing media files: ${error.message}`);
    }
}

async function processMediaUploadSafe(
    uploadData: MediaUploadDataDto,
    s3Media: S3MediaService,
    media: MediaDto,
): Promise<{ success: boolean; warnings: string[] }> {
    const warnings: string[] = [];

    try {
        let preset = uploadData.preset || "default";

        if (preset != "default" && preset != "audio" && preset != "speech") {
            preset = "default";
        }

        const promises: Promise<any>[] = [];

        await validateMediaUpload(media, s3Media, warnings);

        // For now we only process and upload the original  as a single "default" quality.
        // If we later add transcoding, we can push multiple qualities here (e.g., 64k, 128k, 192k).
        promises.push(processQualitySafe(uploadData, "default", s3Media, media));

        const results = await Promise.all(promises);

        // Check if any quality processing failed
        const failedResults = results.filter((r) => !r.success);
        if (failedResults.length > 0) {
            warnings.push(`${failedResults.length} media sizes failed to process`);
            failedResults.forEach((r) => warnings.push(...r.warnings));
        }

        return { success: true, warnings };
    } catch (error) {
        warnings.push(`Failed to process media upload: ${error.message}`);
        return { success: false, warnings: warnings };
    }
}

const mediaFailureMessage = "Media upload failed:\n";

/**
 * Validate a single media upload
 */
async function validateSingleMedia(
    uploadData: MediaUploadDataDto,
    warnings: string[],
    mediaFailureMessage: string,
): Promise<void> {
    try {
        if (!uploadData.fileData || uploadData.fileData.byteLength === 0) {
            warnings.push(mediaFailureMessage + "Media data is empty or invalid\n");
            return;
        }

        // Best-effort metadata validation. If music-metadata isn't available in this runtime
        // (e.g., due to ESM/CJS interop), skip deep validation but continue processing.
        try {
            type MusicMetadata = {
                parserBuffer: () => Promise<typeof import("music-metadata")>;
            };
            const mm = await import("music-metadata");
            const mmEsm = await (mm as unknown as MusicMetadata).parserBuffer();
            const metadata = await mmEsm.parseBuffer(new Uint8Array(uploadData.fileData));

            // Use robust format detection
            const formatInfo = getAudioFormatInfo(metadata);

            if (!formatInfo.isValidAudio) {
                warnings.push(
                    mediaFailureMessage + "Uploaded file may not be a valid media format\n",
                );
            }

            if (!metadata.format.bitrate) {
                warnings.push(
                    mediaFailureMessage + "Could not determine media bitrate (optional)\n",
                );
            }
        } catch (_err) {
            // Non-fatal: env may not support music-metadata import. Proceed without strict validation.
            warnings.push(
                mediaFailureMessage +
                    "Could not inspect media metadata in this environment; continuing without deep validation\n",
            );
        }
    } catch (error) {
        warnings.push(mediaFailureMessage + `Media processing failed: ${error.message}`);
    }
}

/**
 * Validate media processing without failing document validation
 */
async function validateMediaUpload(
    doc: any,
    s3Media: S3MediaService,
    warnings: string[],
): Promise<void> {
    try {
        // check if s3/Minio is connected
        const isConnected = await s3Media.checkConnection();
        if (!isConnected) {
            warnings.push(
                mediaFailureMessage +
                    "Media storage is not connected. Media files will not be processed.\n",
            );
        }

        // check if media bucket exists
        const bucketExists = await s3Media.bucketExists(s3Media.mediaBucket);
        if (!bucketExists) {
            warnings.push(
                mediaFailureMessage +
                    `Media bucket '${s3Media.mediaBucket}' does not exist. Media files will not be processed.`,
            );
        }

        // validate each media upload
        if (doc && doc.uploadData) {
            for (const uploadData of doc.uploadData) {
                await validateSingleMedia(uploadData, warnings, mediaFailureMessage);
            }
        }

        // validate existing media files are accessible
        if (
            doc &&
            typeof doc.fileCollections == typeof MediaFileDto &&
            doc.fileCollections.length > 0
        ) {
            const keys = doc.fileCollections
                .map((f) =>
                    typeof f.fileUrl === "string" ? f.fileUrl.split("/").pop() : undefined,
                )
                .filter((k): k is string => !!k && k.length > 0);
            if (keys.length > 0) {
                const inaccessibleMedias = await s3Media.checkMediaAccessibility(
                    s3Media.mediaBucket,
                    keys,
                );
                if (inaccessibleMedias.length > 0) {
                    warnings.push(
                        mediaFailureMessage +
                            `The following media files are not accessible in the storage bucket: ${inaccessibleMedias.join(
                                ", ",
                            )}`,
                    );
                }
            }
        }

        //Validate existing media files if any
        if (doc && doc.fileCollections && doc.fileCollections.length > 0) {
            await validateMediaInContent(doc.fileCollections, s3Media, warnings);
        }
    } catch (error) {
        warnings.push(`Media validation failed: ${error.message}`);
    }
}

/**
 * Safely uploads a single media quality (currently just the original as "default").
 * - Derives container/extension and mime type from metadata where possible
 * - Uploads to S3 with a key including the quality label (e.g., "-default")
 * - Pushes a MediaFileDto entry to media.fileCollections
 */
async function processQualitySafe(
    uploadData: MediaUploadDataDto,
    qualityLabel: string,
    s3Media: S3MediaService,
    media: MediaDto,
): Promise<{ success: boolean; warnings: string[] }> {
    const warnings: string[] = [];
    try {
        // Parse metadata to infer bitrate and format info
        let formatInfo = { ext: "", mime: "application/octet-stream", isValidAudio: false };
        let bitrate = 0;
        const u8 = new Uint8Array(uploadData.fileData);

        try {
            type MusicMetadata = {
                parserBuffer: () => Promise<typeof import("music-metadata")>;
            };
            const mm = await import("music-metadata");
            const mmEsm = await (mm as unknown as MusicMetadata).parserBuffer();
            const metadata = await mmEsm.parseBuffer(u8);

            // Use robust format detection instead of hardcoded mapping
            formatInfo = getAudioFormatInfo(metadata);
            bitrate = Math.round(metadata.format.bitrate || 0);
        } catch (_err) {
            // Fall back; format/bitrate unknown in this environment
        }

        // Fallback to generic media if we couldn't determine format
        if (!formatInfo.ext) {
            formatInfo.ext = "audio";
            formatInfo.mime = "audio/mpeg"; // safe default
        }

        const key = `${uuidv4()}-${qualityLabel}`;

        // Upload original buffer as-is for now
        const buf = Buffer.from(u8);

        await s3Media.uploadFile(s3Media.mediaBucket, key, buf, formatInfo.mime);

        // Optionally, validate upload accessibility
        const validateRes = await s3Media.validateMediaUpload(s3Media.mediaBucket, key);
        if (!validateRes.success) {
            warnings.push(validateRes.error || "Media validation failed");
        }

        const file = new MediaFileDto();

        file.languageId = (uploadData as MediaUploadDataDto).languageId;
        file.fileUrl = s3Media.getMediaUrl(key);
        file.bitrate = bitrate;
        file.mediaType = (uploadData as any).mediaType;

        media.fileCollections.push(file);

        return { success: true, warnings };
    } catch (error) {
        return {
            success: false,
            warnings: [`Failed to process media quality '${qualityLabel}': ${error.message}\n`],
        };
    }
}
