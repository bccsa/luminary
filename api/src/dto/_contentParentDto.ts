import { Uuid } from "../enums";
import { IsArray, IsOptional, IsBoolean, IsString, ValidateNested } from "class-validator";
import { _contentBaseDto } from "./_contentBaseDto";
import { Expose, Type } from "class-transformer";
import { ImageDto } from "./ImageDto";

/**
 * Database structured _contentParent object
 */
export class _contentParentDto extends _contentBaseDto {
    @IsOptional()
    @ValidateNested()
    @Type(() => ImageDto)
    @Expose()
    imageData?: ImageDto;

    @IsArray()
    @IsString({ each: true })
    @Expose()
    tags: Uuid[];

    @IsBoolean()
    @Expose()
    publishDateVisible: boolean;

    @IsOptional()
    @IsString()
    @Expose()
    imageBucketId?: string; // S3 bucket ID for image storage

    @IsOptional()
    @IsString()
    @Expose()
    mediaBucketId?: string; // S3 bucket ID for media files (audio, video, documents ...)
}
