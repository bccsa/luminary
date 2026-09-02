import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    Min,
    ValidateNested,
} from "class-validator";
import { Expose, Type } from "class-transformer";
import { _contentBaseDto } from "./_contentBaseDto";
import { S3CredentialDto } from "./S3CredentialDto";
import { StorageType, Uuid } from "../enums";

/**
 * Encode settings a media bucket applies to every encode written into it.
 * All optional: an absent field means the encoder's own default.
 */
export class MediaEncodeSettingsDto {
    @IsOptional()
    @IsBoolean()
    @Expose()
    /** Encrypt the HLS output with AES-128. Absent = encrypted. */
    encrypted?: boolean;

    @IsOptional()
    @IsBoolean()
    @Expose()
    /** Byte-range HLS: one chunk file per rendition, split at chunkSizeMB. Absent = on. */
    byteRange?: boolean;

    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(10240)
    @Expose()
    /** Max size of one byte-range chunk file in MB, video and audio alike. Absent = encoder default. */
    chunkSizeMB?: number;
}

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
    @IsEnum(StorageType)
    @Expose()
    storageType: StorageType;

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

    @IsOptional()
    @ValidateNested()
    @Type(() => MediaEncodeSettingsDto)
    @Expose()
    /** Only meaningful on media buckets. */
    mediaSettings?: MediaEncodeSettingsDto;
}
