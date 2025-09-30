import { IsNotEmpty, IsOptional, IsString } from "class-validator";
import { Expose } from "class-transformer";
import { IsAudio } from "../validation/IsAudio";
import { MediaPreset, MediaType } from "../enums";

/**
 * Data for uploading a media file
 */
export class MediaUploadDataDto {
    @IsNotEmpty()
    @Expose()
    @IsAudio()
    fileData: ArrayBuffer;

    @IsString()
    @IsNotEmpty()
    @Expose()
    mediaType: MediaType;

    @IsString()
    @IsNotEmpty()
    @Expose()
    preset: MediaPreset;

    @IsOptional()
    @IsString()
    @Expose()
    filename?: string;

    @IsNotEmpty()
    @IsString()
    @Expose()
    languageId: string;
}
