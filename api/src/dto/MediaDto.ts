import { IsArray, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { Expose, Type } from "class-transformer";
import { MediaFileDto } from "./MediaFileDto";
import { MediaUploadDataDto } from "./MediaUploadDataDto";

/**
 * Database structured Media object
 */
export class MediaDto {
    @IsOptional()
    @IsString()
    @Expose()
    hlsUrl: string;

    @IsNotEmpty()
    @IsArray()
    @Type(() => MediaFileDto)
    @Expose()
    fileCollections: MediaFileDto[];

    @IsOptional()
    @IsArray()
    @Type(() => MediaUploadDataDto)
    @Expose()
    uploadData: MediaUploadDataDto[];
}
