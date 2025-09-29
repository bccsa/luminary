import { MediaDto } from "../dto/MediaDto";
import { MediaUploadDataDto } from "src/dto/MediaUploadDataDto";
import { S3AudioService } from "./s3Audio.service";
import { MediaFileDto } from "src/dto/MediaFileDto";
import { v4 as uuidv4 } from "uuid";

export async function processMedia(
    media: MediaDto,
    prevMedia: MediaDto | undefined,
    s3Audio: S3AudioService,
): Promise<string[]> {
    const warnings: string[] = [];

    try {
        // Handle prevMedia cleanup if needed
        // if (prevMedia) {
        //     const prevFiles = new Set(prevMedia.fileCollections.map((f) => f.fileUrl));
        //     const currentFiles = new Set(media.fileCollections.map((f) => f.fileUrl));
        //     const removedFiles = [...prevFiles].filter((f) => !currentFiles.has(f));

        //     if (removedFiles.length > 0) {
        //         try {
        //             await s3Audio.removeObjects(s3Audio.audioBucket, removedFiles);
        //         } catch (error) {
        //             warnings.push(`Failed to remove old audio files: ${error.message}`);
        //         }
        //     }
        // }

        if (media.uploadData) {
            const promises: Promise<{ success: boolean; warnings: string[] }>[] = [];
            media.uploadData.forEach((uploadData: MediaUploadDataDto) => {
                promises.push(processMediaUploadSafe(uploadData, s3Audio, media));
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
                warnings.push(`${failedUploads} of ${results.length} audio uploads failed`);

                if (successfulUploads === 0) {
                    warnings.push("All audio uploads failed - no audios were processed");
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
 * Validate existing audios in file collections
 */
async function validateAudiosInContent(
    fileCollections: any[],
    s3AudioService: S3AudioService,
    warnings: string[] = [],
): Promise<void> {
    try {
        const allFilenames = fileCollections.flatMap(
            (collection) => collection.imageFiles?.map((file: any) => file.filename) || [],
        );

        if (allFilenames.length > 0) {
            const inaccessibleAudios = await s3AudioService.checkAudioAccessibility(
                s3AudioService.audioBucket,
                allFilenames,
            );
            if (inaccessibleAudios.length > 0) {
                warnings.push(`Some audios are not accessible: ${inaccessibleAudios.join(", ")}`);
            }
        }
    } catch (error) {
        warnings.push(`Failed to validate existing audios: ${error.message}`);
    }
}

async function processMediaUploadSafe(
    uploadData: MediaUploadDataDto,
    s3Audio: S3AudioService,
    media: MediaDto,
): Promise<{ success: boolean; warnings: string[] }> {
    const warnings: string[] = [];

    try {
        let preset = uploadData.preset || "default";

        if (preset != "default" && preset != "audio" && preset != "speech") {
            preset = "default";
        }

        const promises: Promise<any>[] = [];

        await validatAudioProcessing(media, s3Audio, warnings);

        // For now we only process and upload the original audio as a single "default" quality.
        // If we later add transcoding, we can push multiple qualities here (e.g., 64k, 128k, 192k).
        promises.push(processQualitySafe(uploadData, "default", s3Audio, media));

        const results = await Promise.all(promises);

        // Check if any quality processing failed
        const failedResults = results.filter((r) => !r.success);
        if (failedResults.length > 0) {
            warnings.push(`${failedResults.length} audio sizes failed to process`);
            failedResults.forEach((r) => warnings.push(...r.warnings));
        }

        return { success: true, warnings };
    } catch (error) {
        warnings.push(`Failed to process audio upload: ${error.message}`);
        return { success: false, warnings: warnings };
    }
}

const audioFailureMessage = "Audio upload failed:\n";

/**
 * Validate a single audio upload
 */
async function validateSingleAudio(
    uploadData: MediaUploadDataDto,
    warnings: string[],
    audioFailureMessage: string,
): Promise<void> {
    try {
        if (!uploadData.fileData || uploadData.fileData.byteLength === 0) {
            warnings.push(audioFailureMessage + "Audio data is empty or invalid\n");
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

            if (!metadata.format || !metadata.format.container) {
                warnings.push(
                    audioFailureMessage + "Uploaded file may not be a valid audio format\n",
                );
            }

            if (!metadata.format.bitrate) {
                warnings.push(
                    audioFailureMessage + "Could not determine audio bitrate (optional)\n",
                );
            }
        } catch (_err) {
            // Non-fatal: env may not support music-metadata import. Proceed without strict validation.
            warnings.push(
                audioFailureMessage +
                    "Could not inspect audio metadata in this environment; continuing without deep validation\n",
            );
        }
    } catch (error) {
        warnings.push(audioFailureMessage + `Audio processing failed: ${error.message}`);
    }
}

/**
 * Validate media prosessing without failing document validation
 */
async function validatAudioProcessing(
    doc: any,
    s3Audio: S3AudioService,
    warnings: string[],
): Promise<void> {
    try {
        // check if s3/Minio is connected
        const isConnected = await s3Audio.checkConnection();
        if (!isConnected) {
            warnings.push(
                audioFailureMessage +
                    "Audio storage is not connected. Audios will not be processed.\n",
            );
        }

        // check if audio bucket exists
        const bucketExists = await s3Audio.bucketExists(s3Audio.audioBucket);
        if (!bucketExists) {
            warnings.push(
                audioFailureMessage +
                    `Audio bucket '${s3Audio.audioBucket}' does not exist. Audios will not be processed.`,
            );
        }

        // validate each audio upload
        if (doc && doc.uploadData) {
            for (const uploadData of doc.uploadData) {
                await validateSingleAudio(uploadData, warnings, audioFailureMessage);
            }
        }

        // validate existing audio files are accessible
        if (doc && Array.isArray(doc.fileCollections) && doc.fileCollections.length > 0) {
            const keys = doc.fileCollections
                .map((f) =>
                    typeof f.fileUrl === "string" ? f.fileUrl.split("/").pop() : undefined,
                )
                .filter((k): k is string => !!k && k.length > 0);
            if (keys.length > 0) {
                const inaccessibleAudios = await s3Audio.checkAudioAccessibility(
                    s3Audio.audioBucket,
                    keys,
                );
                if (inaccessibleAudios.length > 0) {
                    warnings.push(
                        audioFailureMessage +
                            `The following audio files are not accessible in the storage bucket: ${inaccessibleAudios.join(
                                ", ",
                            )}`,
                    );
                }
            }
        }

        //Validate existing audios if any
        if (doc && doc.fileCollections && doc.fileCollections.length > 0) {
            await validateAudiosInContent(doc.fileCollections, s3Audio, warnings);
        }
    } catch (error) {
        warnings.push(`Audio validation failed: ${error.message}`);
    }
}

/**
 * Safely uploads a single audio quality (currently just the original as "default").
 * - Derives container/extension and mime type from metadata where possible
 * - Uploads to S3 with a key including the quality label (e.g., "-default")
 * - Pushes a MediaFileDto entry to media.fileCollections
 */
async function processQualitySafe(
    uploadData: MediaUploadDataDto,
    qualityLabel: string,
    s3Audio: S3AudioService,
    media: MediaDto,
): Promise<{ success: boolean; warnings: string[] }> {
    const warnings: string[] = [];
    try {
        // Parse metadata to infer bitrate and container/extension
        let container = "";
        let bitrate = 0;
        const u8 = new Uint8Array(uploadData.fileData);
        try {
            type MusicMetadata = {
                parserBuffer: () => Promise<typeof import("music-metadata")>;
            };
            const mm = await import("music-metadata");
            const mmEsm = await (mm as unknown as MusicMetadata).parserBuffer();
            const metadata = await mmEsm.parseBuffer(u8);
            container = (metadata.format.container || "").toLowerCase();
            bitrate = Math.round(metadata.format.bitrate || 0);
        } catch (_err) {
            // Fall back; container/bitrate unknown in this environment
        }

        // Basic mapping from container to extension and mime type
        const toExtAndMime = (c: string): { ext: string; mime: string } => {
            if (c.includes("wav") || c.includes("wave")) return { ext: "wav", mime: "audio/wav" };
            if (c.includes("mpeg") || c.includes("mp3")) return { ext: "mp3", mime: "audio/mpeg" };
            if (c.includes("aac") || c.includes("adts")) return { ext: "aac", mime: "audio/aac" };
            if (c.includes("ogg")) return { ext: "ogg", mime: "audio/ogg" };
            if (c.includes("opus")) return { ext: "opus", mime: "audio/opus" };
            if (c.includes("flac")) return { ext: "flac", mime: "audio/flac" };
            return { ext: "", mime: "" };
        };

        // Prefer original filename extension if provided
        let providedExt: string | undefined;
        if (uploadData.filename && typeof uploadData.filename === "string") {
            const parts = uploadData.filename.split(".");
            if (parts.length > 1) {
                providedExt = parts.pop()!.toLowerCase();
            }
        }

        // If we have a provided extension, derive a sensible mime; otherwise fall back to metadata
        let ext = "";
        let mime = "application/octet-stream";
        if (providedExt) {
            const map: Record<string, string> = {
                mp3: "audio/mpeg",
                wav: "audio/wav",
                aac: "audio/aac",
                ogg: "audio/ogg",
                opus: "audio/opus",
                flac: "audio/flac",
                m4a: "audio/mp4",
            };
            ext = providedExt;
            mime = map[providedExt] || mime;
        } else {
            const m = toExtAndMime(container);
            ext = m.ext;
            mime = m.mime;
        }

        const key = `${uuidv4()}-${qualityLabel}.${ext}`; // include quality label e.g. "-default"

        // Upload original buffer as-is for now
        const buf = Buffer.from(u8);

        await s3Audio.uploadFile(s3Audio.audioBucket, key, buf, mime);

        // Optionally, validate upload accessibility
        const validateRes = await s3Audio.validateAudioUpload(s3Audio.audioBucket, key);
        if (!validateRes.success) {
            warnings.push(validateRes.error || "Audio validation failed");
        }

        const file = new MediaFileDto();
        // languageId isn't specified in uploadData; default to 'default' to satisfy validation
        file.languageId = "default";
        file.fileUrl = s3Audio.getAudioUrl(key);
        file.filename = uploadData.filename;
        file.bitrate = bitrate;
        file.mediaType = (uploadData as any).mediaType;

        media.fileCollections.push(file);

        return { success: true, warnings };
    } catch (error) {
        return {
            success: false,
            warnings: [`Failed to process audio quality '${qualityLabel}': ${error.message}\n`],
        };
    }
}
