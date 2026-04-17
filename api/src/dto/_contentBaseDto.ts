import { ArrayNotEmpty, IsArray, IsString } from "class-validator";
import { _baseDto } from "./_baseDto";
import { Uuid } from "../enums";
import { Expose } from "class-transformer";

/**
 * Base Data Transfer Object class for all database storable content data transfer objects
 */
export class _contentBaseDto extends _baseDto {
    // Override parent's loose @IsArray to enforce non-empty string[]. A provider
    // with no memberOf is effectively hidden from every group in the CMS — and
    // also breaks the public-users login flow which needs to read the provider
    // doc to trigger the Auth0 redirect.
    @IsArray()
    @ArrayNotEmpty()
    @IsString({ each: true })
    @Expose()
    public memberOf: Uuid[];
}
