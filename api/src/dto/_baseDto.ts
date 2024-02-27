import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { DocType, Uuid } from "../enums";
import { Expose } from "class-transformer";

const JANUARY_FIRST_2024_TIMESTAMP = 1704114000000;

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
    @Min(JANUARY_FIRST_2024_TIMESTAMP)
    updatedTimeUtc?: number;
}
