import { IsArray } from "class-validator";
import { _baseDto } from "./_baseDto";
import { Uuid } from "../enums";
import { Expose } from "class-transformer";

/**
 * Base Data Transfer Object class for all database storable content data transfer objects
 */
export class _contentBaseDto extends _baseDto {
    @IsArray()
    @Expose()
    memberOf: Uuid[];
}
