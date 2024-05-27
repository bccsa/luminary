import { ImageFileDto } from "../dto/ImageFileDto";
import { ImageDto } from "../dto/ImageDto";
import * as sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import { S3Service } from "./s3.service";
import { ImageUploadDto } from "../dto/ImageUploadDto";

const imageSizes = [180, 360, 640, 1280, 2560];

/**
 * Processes an image upload by resizing the image and uploading it to S3
 */
export async function processImage(
    image: ImageDto,
    prevDoc: ImageDto,
    s3: S3Service,
): Promise<ImageDto> {
    const resultImage = { ...image };
    delete resultImage.uploadData;

    // Remove files that were removed from the image
    if (prevDoc) {
        const removedFiles = prevDoc?.files.filter(
            (file) => !image.files.some((f) => f.filename === file.filename),
        );

        if (removedFiles.length > 0) {
            await s3.removeObjects(
                s3.imageBucket,
                removedFiles.map((file) => file.filename),
            );
        }
    }

    // Remove file objects that were added to the image: Only the API can add image files. A client may submit "new" image files,
    // but this usually will happen if an offline client saved changes to an image which had file objects removed by onother client.
    // When the offline client comes online, it's change request will then contain file objects that were previously removed, and
    // as such need to be ignored.
    if (prevDoc) {
        resultImage.files = prevDoc.files.filter((file) =>
            image.files.some((f) => f.filename === file.filename),
        );
    }

    const promises: Promise<any>[] = [];
    image.uploadData?.forEach((uploadData) => {
        promises.push(processImageUpload(uploadData, s3, resultImage));
    });

    await Promise.all(promises).catch(async (err) => {
        // Attempt to clear uploaded files before throwing error
        const keys = resultImage.files
            .filter((file) => !image.files.some((f) => f.filename === file.filename))
            .map((file) => file.filename);
        await s3.removeObjects(s3.imageBucket, keys);
        throw err;
    });

    return resultImage;
}

async function processImageUpload(
    uploadData: ImageUploadDto,
    s3: S3Service,
    resultImage: ImageDto,
) {
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
    const aspectRatio = Math.round((metadata.width / metadata.height) * 100) / 100;

    imageSizes.forEach(async (size) => {
        if (metadata.width < size / 1.1) return; // allow slight upscaling
        promises.push(processQuality(uploadData, size, s3, preset, resultImage, aspectRatio));
    });

    await Promise.all(promises);
}

async function processQuality(
    uploadData: ImageUploadDto,
    size: number,
    s3: S3Service,
    preset: keyof sharp.PresetEnum,
    resultImage: ImageDto,
    aspectRatio: number,
) {
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
    imageFile.aspectRatio = aspectRatio;
    imageFile.filename = uuidv4();

    // Save resized image to S3
    await s3.uploadFile(s3.imageBucket, imageFile.filename, resized.data, "image/webp");

    resultImage.files.push(imageFile);
}
