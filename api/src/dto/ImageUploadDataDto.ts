import { IsNotEmpty, IsString } from "class-validator";
import { Expose } from "class-transformer";
import { IsImage } from "../validation/IsImage";
import * as sharp from "sharp";

/**
 * Data for uploading an image
 */
export class ImageUploadDataDto {
    @IsNotEmpty()
    @IsImage()
    @Expose()
    fileData?: Buffer;

    @IsString()
    @IsNotEmpty()
    @Expose()
    preset: keyof sharp.PresetEnum;
}
