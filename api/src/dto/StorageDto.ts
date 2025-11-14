import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested } from "class-validator";
import { Expose, Type } from "class-transformer";
import { _contentBaseDto } from "./_contentBaseDto";
import { S3CredentialDto } from "./S3CredentialDto";
import { BucketType, Uuid } from "../enums";

/**
 * Description of an S3 bucket / storage location used by the application.
 */
export class StorageDto extends _contentBaseDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    name: string;

    @IsArray()
    @IsString({ each: true })
    @Expose()
    mimeTypes: string[] = []; // e.g. ['image/*','audio/*','application/pdf']

    @IsNotEmpty()
    @IsString()
    @Expose()
    publicUrl: string; // public base path

    @IsNotEmpty()
    @IsString()
    @IsEnum(BucketType)
    @Expose()
    bucketType: BucketType;

    @IsOptional()
    @ValidateNested()
    @Type(() => S3CredentialDto)
    @Expose()
    /** Optional reference to an EncryptedStorageDto document that holds
     * encrypted S3CredentialDto data. Note: S3CredentialDto itself is a
     * type (not a persisted doc) and must be encrypted before storage.
     */
    credential?: S3CredentialDto;

    @IsOptional()
    @IsString()
    @Expose()
    /* Optional ID of EncryptedStorageDto document that holds encrypted S3CredentialDto data */
    credential_id?: Uuid;
}
