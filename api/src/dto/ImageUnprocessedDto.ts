import { Expose } from "class-transformer";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";
import sharp from "sharp";

/**
 * This DTO represents an unprocessed image upload request.
 * It is used to keep original image dto validation
    @property {string} fileIndex - The index of the file in the upload - Note: This is to find the correct
    image arrayBuffer (that is now sent via FormData) for ImageUploadDto. This method ensures that the
    original security set in place for the server is still in place. 
 */
export class ImageUnprocessedDto {
    @IsString()
    fileIndex: string;

    @IsString()
    @IsNotEmpty()
    @Expose()
    preset: keyof sharp.PresetEnum;

    @IsString()
    @IsOptional()
    @Expose()
    filename?: string;
}
