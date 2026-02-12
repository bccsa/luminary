import { IsNotEmpty, IsString, IsOptional } from "class-validator";
import { Expose } from "class-transformer";
import { IsImage } from "../validation/IsImage";
import * as sharp from "sharp";

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

    @IsString()
    @IsOptional()
    @Expose()
    filename?: string;
}
