import { IsDate, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { DocType, Uuid } from "../enums";

/**
 * Base Data Transfer Object class for all database storable data transfer objects
 */
export class _baseDto {
    @IsNotEmpty()
    @IsString()
    _id: Uuid;

    @IsString()
    @IsOptional()
    _rev?: string;

    @IsNotEmpty()
    @IsEnum(DocType)
    type: DocType;

    // TODO check if it's a valid timestamp
    @IsOptional()
    updatedTimeUtc?: number;
}
