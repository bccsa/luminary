import "reflect-metadata"; // https://stackoverflow.com/questions/72009995/typeerror-reflect-getmetadata-is-not-a-function
import { IsArray, IsOptional, IsString, ValidateNested } from "class-validator";
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
    hlsUrl?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MediaFileDto) // This throws an exception on validation failure, so we need to catch the error on validation. The message is less user-friendly but at least the validator fails and will protect our data.
    @Expose()
    fileCollections: MediaFileDto[] = [];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MediaUploadDataDto) // This throws an exception on validation failure, so we need to catch the error on validation. The message is less user-friendly but at least the validator fails and will protect our data.
    @Expose()
    uploadData?: MediaUploadDataDto[];
}
