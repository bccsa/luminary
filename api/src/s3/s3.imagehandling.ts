import { ImageFileDto } from "../dto/ImageFileDto";
import { ImageDto } from "../dto/ImageDto";
import * as sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import { S3Service } from "./s3.service";
import { ImageUploadDataDto } from "../dto/ImageUploadDataDto";

const imageSizes = [180, 360, 640, 1280, 2560];

/**
 * Processes an image upload by resizing the image and uploading it to S3
 */
export async function processImageUpload(image: ImageDto, s3: S3Service): Promise<ImageDto> {
    if (!image.uploadData) throw new Error("No image data provided");

    const resultImage = { ...image };
    delete resultImage.uploadData;

    const promises: Promise<any>[] = [];

    image.uploadData.forEach((uploadData) => {
        promises.push(processImage(uploadData, s3, resultImage));
    });

    await Promise.all(promises).catch(async (err) => {
        // Attempt to clear uploaded files before throwing error
        const keys = resultImage.files
            .filter((file) => !image.files.some((f) => f.fileName === file.fileName))
            .map((file) => file.fileName);
        await s3.removeObjects(s3.imageBucket, keys);
        throw err;
    });

    // TODO: delete removed image files from S3

    return resultImage;
}

async function processImage(uploadData: ImageUploadDataDto, s3: S3Service, resultImage: ImageDto) {
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

    imageSizes.forEach(async (size) => {
        if (metadata.width < size / 1.1) return; // allow slight upscaling
        promises.push(processQuality(uploadData, size, s3, preset, resultImage));
    });

    await Promise.all(promises);
}

async function processQuality(
    uploadData: ImageUploadDataDto,
    size: number,
    s3: S3Service,
    preset: keyof sharp.PresetEnum,
    resultImage: ImageDto,
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
    imageFile.aspectRatio = resized.info.width / resized.info.height;
    imageFile.fileName = uuidv4();

    // Save resized image to S3
    await s3.uploadFile(s3.imageBucket, imageFile.fileName, resized.data, "image/webp");

    resultImage.files.push(imageFile);
}
