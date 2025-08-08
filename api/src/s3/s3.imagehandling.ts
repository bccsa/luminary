import { ImageFileDto } from "../dto/ImageFileDto";
import { ImageDto } from "../dto/ImageDto";
import * as sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import { S3Service } from "./s3.service";
import { ImageUploadDto } from "../dto/ImageUploadDto";
import { ImageFileCollectionDto } from "../dto/ImageFileCollectionDto";

const imageSizes = [180, 360, 640, 1280, 2560];

/**
 * Processes an embedded image upload by resizing the image and uploading it to S3
 * Returns warnings for any issues encountered but doesn't throw errors
 */
export async function processImage(
    image: ImageDto,
    prevImage: ImageDto | undefined,
    s3: S3Service,
): Promise<string[]> {
    const warnings: string[] = [];

    try {
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

            if (removedFiles.length > 0) {
                try {
                    await s3.removeObjects(
                        s3.imageBucket,
                        removedFiles.map((file) => file.filename),
                    );
                } catch (error) {
                    warnings.push(`Failed to remove old images: ${error.message}`);
                }
            }

            // Remove file objects that were added to the image: Only the API may add image files. A client can occasionally submit "new" image files,
            // but this usually will happen if an offline client saved changes to an image which had file objects removed by another client.
            // When the offline client comes online, it's change request will then contain file objects that were previously removed, and
            // as such need to be ignored.
            image.fileCollections = prevImage.fileCollections.filter((collection) =>
                // Only include collections from the previous document that are also in the new document
                image.fileCollections.some((c) =>
                    c.imageFiles.some((f) => collection.imageFiles[0]?.filename === f.filename),
                ),
            );
        }

        // Upload new files
        if (image.uploadData) {
            const promises: Promise<{ success: boolean; warnings: string[] }>[] = [];
            image.uploadData?.forEach((uploadData) => {
                promises.push(processImageUploadSafe(uploadData, s3, image));
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

async function processImageUploadSafe(
    uploadData: ImageUploadDto,
    s3: S3Service,
    image: ImageDto,
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

        imageSizes.forEach(async (size) => {
            if (metadata.width < size / 1.1) return; // allow slight upscaling
            promises.push(processQualitySafe(uploadData, size, s3, preset, resultImageCollection));
        });

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

async function processQualitySafe(
    uploadData: ImageUploadDto,
    size: number,
    s3: S3Service,
    preset: keyof sharp.PresetEnum,
    resultImageCollection: ImageFileCollectionDto,
): Promise<{ success: boolean; warnings: string[] }> {
    try {
        const resized = await sharp(uploadData.fileData)
            .resize(size)
            .webp({
                quality: s3.imageQuality,
                preset: preset,
            })
            .toBuffer({ resolveWithObject: true });

        const imageFile = new ImageFileDto();
        imageFile.width = resized.info.width;
        imageFile.height = resized.info.height;
        imageFile.filename = uuidv4();

        // Save resized image to S3
        await s3.uploadFile(s3.imageBucket, imageFile.filename, resized.data, "image/webp");

        resultImageCollection.imageFiles.push(imageFile);

        return { success: true, warnings: [] };
    } catch (error) {
        return {
            success: false,
            warnings: [`Failed to process image size ${size}px: ${error.message}\n`],
        };
    }
}
