import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
import { Expose } from "class-transformer";
import { MediaType } from "../enums";

/**
 * Database structured MediaFile object
 */
export class MediaFileDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    languageId: string;

    @IsNotEmpty()
    @IsString()
    @Expose()
    fileUrl: string;

    @IsNumber()
    @Expose()
    @IsNotEmpty()
    bitrate: number;

    @IsString()
    @IsNotEmpty()
    @Expose()
    mediaType: MediaType;

    @IsNumber()
    @Expose()
    @IsOptional()
    processingProgress?: number;
}
