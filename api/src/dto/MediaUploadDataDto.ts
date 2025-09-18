import { IsNotEmpty, IsString } from "class-validator";
import { Expose } from "class-transformer";

/**
 * Data for uploading a media file
 */
export class MediaUploadDataDto {
    @IsNotEmpty()
    @Expose()
    fileData: ArrayBuffer;

    @IsString()
    @IsNotEmpty()
    @Expose()
    mediaType: "video" | "audio";

    @IsString()
    @IsNotEmpty()
    @Expose()
    preset: "speech" | "music" | "default";
}
