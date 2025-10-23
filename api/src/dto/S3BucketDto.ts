import { IsArray, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { Expose } from "class-transformer";
import { _contentBaseDto } from "./_contentBaseDto";
import { S3CredentialDto } from "./S3CredentialDto";
import { Uuid } from "../enums";

/**
 * Description of an S3 bucket / storage location used by the application.
 */
export class S3BucketDto extends _contentBaseDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    name: string;

    @IsArray()
    @IsString({ each: true })
    @Expose()
    fileTypes: string[] = []; // e.g. ['image','media','attachment']

    @IsNotEmpty()
    @IsString()
    @Expose()
    httpPath: string; // public base path

    @IsOptional()
    @IsString()
    @Expose()
    /** Optional reference to an EncryptedStorageDto document that holds
     * encrypted S3CredentialDto data. Note: S3CredentialDto itself is a
     * type (not a persisted doc) and must be encrypted before storage.
     */
    credential?: S3CredentialDto;

    @IsOptional()
    @IsString()
    @Expose()
    /* Optional ID of EncryptedStorageDto document that holds */
    credential_id?: Uuid;
}
