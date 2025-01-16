import { Expose } from "class-transformer";
import { IsNotEmpty, IsString, IsOptional, IsNumber, IsBoolean, IsArray } from "class-validator";
import { DocType } from "../enums";

/**
 * Document structure for client / CMS submitted changes to existing documents or new documents.
 */
export class DocsReqDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    apiVersion: string;

    @IsNotEmpty()
    @IsNumber()
    @IsOptional()
    @Expose()
    gapStart?: number | string;

    @IsNotEmpty()
    @IsNumber()
    @IsOptional()
    @Expose()
    gapEnd?: number | string;

    @IsNotEmpty()
    @IsArray()
    @Expose()
    docTypes: Array<any>;

    @IsNotEmpty()
    @IsBoolean()
    @IsOptional()
    @Expose()
    contentOnly?: boolean;

    @IsString()
    @IsOptional()
    @Expose()
    group: string;

    @IsNotEmpty()
    @IsString()
    @Expose()
    type: DocType;
}
