import { Expose } from "class-transformer";
import { AccessMap } from "../permissions/permissions.service";
import {
    IsNotEmpty,
    IsString,
    IsOptional,
    IsNumber,
    IsObject,
    IsBoolean,
    IsArray,
} from "class-validator";
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
    @IsOptional()
    @Expose()
    docTypes?: Array<any>;

    @IsNotEmpty()
    @IsBoolean()
    @IsOptional()
    @Expose()
    contentOnly?: boolean;

    @IsNotEmpty()
    @IsObject()
    @Expose()
    accessMap: AccessMap;

    @IsNotEmpty()
    @IsString()
    @Expose()
    type: DocType;
}
