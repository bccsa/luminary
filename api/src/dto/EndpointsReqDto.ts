import { Expose } from "class-transformer";
import { IsNotEmpty, IsString, IsOptional, IsNumber, IsBoolean, IsArray } from "class-validator";
import { DocType } from "../enums";

/**
 * Api Request structure for APP / CMS requesting documents from the api
 */
export class DocsReqDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    apiVersion?: string;

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

/**
 * Api Request structure for APP / CMS requesting documents from the api
 */
export class SearchReqDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    apiVersion?: string;

    @IsOptional()
    @IsNumber()
    @Expose()
    limit?: number;

    @IsOptional()
    @IsNumber()
    @Expose()
    offset?: number;

    @IsOptional()
    @IsString()
    @Expose()
    sort?: "desc" | "asc";

    @IsOptional()
    @IsArray()
    @Expose()
    groups?: Array<string>;

    @IsNotEmpty()
    @IsArray()
    @Expose()
    types: Array<DocType>;

    @IsNotEmpty()
    @IsBoolean()
    @IsOptional()
    @Expose()
    contentOnly?: boolean;

    @IsOptional()
    @IsString()
    @Expose()
    queryString?: string;

    @IsNotEmpty()
    @IsNumber()
    @IsOptional()
    @Expose()
    from?: number;

    @IsNotEmpty()
    @IsNumber()
    @IsOptional()
    @Expose()
    to?: number;
}
