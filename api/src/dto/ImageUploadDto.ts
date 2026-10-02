import { IsNotEmpty, IsString } from "class-validator";
import { Expose } from "class-transformer";
import { IsImage } from "../validation/IsImage";
import sharp = require("sharp");

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
    preset: keyof sharp.PresetEnum;
}
