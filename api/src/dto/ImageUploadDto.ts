import { IsNotEmpty, IsString } from "class-validator";
import { Expose } from "class-transformer";
import { IsImage } from "../validation/IsImage";
import type { PresetEnum } from "sharp";

/**
 * Data for uploading an image
 */
export class ImageUploadDto {
    @IsNotEmpty()
    @IsImage()
    @Expose()
    fileData: ArrayBuffer;

    @IsString()
    @IsNotEmpty()
    @Expose()
    preset: keyof PresetEnum;
}
