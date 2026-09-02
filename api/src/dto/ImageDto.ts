import "reflect-metadata"; // https://stackoverflow.com/questions/72009995/typeerror-reflect-getmetadata-is-not-a-function
import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from "class-validator";
import { Expose, Type } from "class-transformer";
import { ImageUploadDto } from "./ImageUploadDto";
import { ImageFileCollectionDto } from "./ImageFileCollectionDto";
import { Uuid } from "../enums";

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

    /**
     * Id of the parent this image is being copied from. The source bucket and files are resolved
     * from that document server-side, so the copy does not depend on the client's own state.
     */
    @IsOptional()
    @IsString()
    @Expose()
    duplicateFrom?: Uuid;

    /** @deprecated Superseded by `duplicateFrom`; still accepted from older clients. */
    @IsOptional()
    @IsBoolean()
    @Expose()
    duplicate?: boolean;
}
