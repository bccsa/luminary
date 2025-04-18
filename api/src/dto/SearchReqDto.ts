import { Expose } from "class-transformer";
import { IsNotEmpty, IsString, IsOptional, IsNumber, IsBoolean, IsArray } from "class-validator";
import { DocType } from "../enums";
import { IsSortOptions } from "../validation/IsSortOptions";

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
    @Expose()
    @IsSortOptions()
    sort?: Array<{ [key: string]: "desc" | "asc" }>;

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

    @IsNotEmpty()
    @IsArray()
    @IsOptional()
    @Expose()
    languages?: Array<string>;

    @IsOptional()
    @IsBoolean()
    @Expose()
    includeDeleteCmds?: boolean;

    @IsOptional()
    @IsString()
    @Expose()
    docId?: string;
}
