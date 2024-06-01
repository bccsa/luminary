import "reflect-metadata"; // https://stackoverflow.com/questions/72009995/typeerror-reflect-getmetadata-is-not-a-function
import { IsArray, IsNotEmpty, IsNumber, ValidateNested } from "class-validator";
import { Expose, Type } from "class-transformer";
import { ImageFileDto } from "./ImageFileDto";

/**
 * Database structured ImageFileCollection object
 */
export class ImageFileCollectionDto {
    @IsNotEmpty()
    @IsNumber()
    @Expose()
    aspectRatio: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ImageFileDto) // This throws an exception on validation failure, so we need to catch the error on validation. The message is less user-friendly but at least the validator fails and will protect our data.
    @Expose()
    imageFiles: ImageFileDto[] = [];
}
