import { MediaDto } from "../dto/MediaDto";
import { MediaUploadDataDto } from "src/dto/MediaUploadDataDto";
import { S3AudioService } from "./s3Audio.service";

export async function processMedia(
    media: MediaDto,
    prevMedia: MediaDto | undefined,
    s3Audio: S3AudioService,
): Promise<string[]> {
    const warnings: string[] = [];

    try {
        // Handle prevMedia cleanup if needed
        if (prevMedia) {
            const prevFiles = new Set(prevMedia.fileCollections.map((f) => f.fileUrl));
            const currentFiles = new Set(media.fileCollections.map((f) => f.fileUrl));
            const removedFiles = [...prevFiles].filter((f) => !currentFiles.has(f));

            if (removedFiles.length > 0) {
                try {
                    await s3Audio.removeObjects(s3Audio.audioBucket, removedFiles);
                } catch (error) {
                    warnings.push(`Failed to remove old audio files: ${error.message}`);
                }
            }
        }

        if (media.uploadData) {
            const promises: Promise<{ success: boolean; warnings: string[] }>[] = [];
            media.uploadData.forEach((uploadData: MediaUploadDataDto) => {
                promises.push(processAudioUploadSafe(uploadData, s3Audio, media));
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

async function processAudioUploadSafe(
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

        type MusicMetadata = {
            parserBuffer: () => Promise<typeof import("music-metadata")>;
        };
        const mm = await import("music-metadata");
        const mmEsm = await (mm as unknown as MusicMetadata).parserBuffer();

        // Parse the metadata from the stream
        const metadata = await mmEsm.parseBuffer(Buffer.from(uploadData.fileData), null, {
            duration: false,
            skipCovers: true,
        });

        if (!metadata.format || !metadata.format.container) {
            warnings.push(audioFailureMessage + "Uploaded file is not a valid audio format\n");
        }

        if (!metadata.format.bitrate) {
            warnings.push(audioFailureMessage + "Could not determine audio bitrate\n");
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
        if (doc.media && doc.media.uploadData) {
            for (const uploadData of doc.media.uploadData) {
                await validateSingleAudio(uploadData, warnings, audioFailureMessage);
            }
        }

        // validate existing audio files are accessible
        if (doc.media && doc.media.files && doc.media.files.length > 0) {
            const inaccessibleAudios = await s3Audio.checkAudioAccessibility(
                s3Audio.audioBucket,
                doc.media.files.map((f) => f.s3Key),
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

        //Validate existing audios if any
        if (doc.media && doc.media.fileCollections && doc.media.fileCollections.length > 0) {
            await validateAudiosInContent(doc.media.fileCollections, s3Audio, warnings);
        }
    } catch (error) {
        warnings.push(`Audio validation failed: ${error.message}`);
    }
}
