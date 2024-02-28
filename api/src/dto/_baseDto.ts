import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
import { DocType, Uuid } from "../enums";
import { Expose } from "class-transformer";

/**
 * Base Data Transfer Object class for all database storable data transfer objects
 */
export class _baseDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    _id: Uuid;

    @IsString()
    @IsOptional()
    _rev?: string;

    @IsNotEmpty()
    @IsEnum(DocType)
    @Expose()
    type: DocType;

    @IsOptional()
    @IsNumber()
    updatedTimeUtc?: number;
}
