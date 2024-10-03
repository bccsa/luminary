import "reflect-metadata"; // https://stackoverflow.com/questions/72009995/typeerror-reflect-getmetadata-is-not-a-function
import { IsArray, IsOptional, ValidateNested } from "class-validator";
import { Expose, Type } from "class-transformer";
import { ImageUploadDto } from "./ImageUploadDto";
import { ImageFileCollectionDto } from "./ImageFileCollectionDto";

/**
 * Database structured Image object
 */
export class ImageDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ImageFileCollectionDto) // This throws an exception on validation failure, so we need to catch the error on validation. The message is less user-friendly but at least the validator fails and will protect our data.
    @Expose()
    fileCollections: ImageFileCollectionDto[] = [];

    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => ImageUploadDto) // This throws an exception on validation failure, so we need to catch the error on validation. The message is less user-friendly but at least the validator fails and will protect our data.
    @Expose()
    uploadData?: ImageUploadDto[];
}
