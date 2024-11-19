import { Expose } from "class-transformer";
import { AccessMap } from "../permissions/permissions.service";
import { Type } from "class-transformer";
import { DocType } from "../enums";
import {
    IsNotEmpty,
    IsString,
    IsOptional,
    IsNumber,
    ValidateNested,
    IsObject,
    IsBoolean,
    IsArray,
} from "class-validator";

export class ClientDataReq {
    @IsNotEmpty()
    @IsNumber()
    @Expose()
    version: number;

    @IsNotEmpty()
    @IsNumber()
    @IsOptional()
    @Expose()
    versionEnd: number;

    @IsNotEmpty()
    @IsString()
    @IsOptional()
    @Expose()
    docType: DocType;

    @IsNotEmpty()
    @IsBoolean()
    @IsOptional()
    @Expose()
    cms: boolean;

    @IsNotEmpty()
    @IsObject()
    @Expose()
    accessMap: AccessMap;
}

/**
 * Document structure for client / CMS submitted changes to existing documents or new documents.
 */
export class PostDocsDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    apiVersion: string;

    @IsNotEmpty()
    @IsArray()
    @Expose()
    memberOf: string[];

    @IsNotEmpty()
    @IsString()
    @Expose()
    userId: string;

    @IsNotEmpty()
    @ValidateNested()
    @Type(() => ClientDataReq)
    @IsObject()
    @Expose()
    reqData: ClientDataReq;

    @IsNotEmpty()
    @IsBoolean()
    @IsOptional()
    @Expose()
    newDataReq: boolean;

    @IsNotEmpty()
    @IsBoolean()
    @IsOptional()
    @Expose()
    oldDataReq: boolean;

    @IsNotEmpty()
    @IsBoolean()
    @IsOptional()
    @Expose()
    backfillDataReq: boolean;
}
