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

/**
 * Api Request structure for APP / CMS requesting documents from the api
 */
export class GroupsReqDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    apiVersion: string;
}
