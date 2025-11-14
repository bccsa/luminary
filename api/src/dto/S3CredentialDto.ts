import { IsNotEmpty, IsOptional, IsString } from "class-validator";
import { Expose } from "class-transformer";

/**
 * S3CredentialDto represents S3 credentials that are intended to be serialized
 * and stored encrypted inside an `EncryptedStorageDto` document. This class
 * includes validation to ensure credential integrity before encryption.
 */
export class S3CredentialDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    endpoint: string;

    @IsOptional()
    @IsString()
    @Expose()
    bucketName?: string; // encrypted when persisted inside EncryptedStorageDto

    @IsOptional()
    @IsString()
    @Expose()
    accessKey?: string; // encrypted when persisted inside EncryptedStorageDto

    @IsOptional()
    @IsString()
    @Expose()
    secretKey?: string; // encrypted when persisted inside EncryptedStorageDto
}
