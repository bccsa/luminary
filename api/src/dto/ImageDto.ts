import "reflect-metadata"; // https://stackoverflow.com/questions/72009995/typeerror-reflect-getmetadata-is-not-a-function
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from "class-validator";
import { _contentBaseDto } from "./_contentBaseDto";
import { Expose, Type } from "class-transformer";
import { ImageFileDto } from "./ImageFileDto";
import { ImageUploadDataDto } from "./ImageUploadDataDto";

/**
 * Database structured Image object
 */
export class ImageDto extends _contentBaseDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    name: string;

    @IsOptional()
    @IsString()
    @Expose()
    description: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ImageFileDto) // This throws an exception on validation failure, so we need to catch the error on validation. The message is less user-friendly but at least the validator fails and will protect our data.
    @Expose()
    files: ImageFileDto[] = [];

    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => ImageUploadDataDto) // This throws an exception on validation failure, so we need to catch the error on validation. The message is less user-friendly but at least the validator fails and will protect our data.
    @Expose()
    uploadData?: ImageUploadDataDto[];
}
