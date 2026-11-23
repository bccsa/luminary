import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
import { DocType } from "../enums";
import { Expose } from "class-transformer";
import { _baseDocumentDto } from "./_baseDocumentDto";

/**
 * Base Data Transfer Object class for all database storable data transfer objects
 */
export class _baseDto extends _baseDocumentDto<DocType> {
    @IsString()
    @IsOptional()
    _rev?: string;

    @IsNotEmpty()
    @IsEnum(DocType)
    @Expose()
    type: DocType;

    @IsString()
    @IsOptional()
    @Expose()
    updatedBy?: string;

    @IsOptional()
    @IsNumber()
    updatedTimeUtc?: number;

    @IsOptional()
    @IsNumber()
    @Expose()
    deleteReq?: number;
}
