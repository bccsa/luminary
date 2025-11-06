// S3 Management Types
import { type StorageDto, type S3CredentialDto } from "luminary-shared";

export type CreateBucketRequest = {
    bucket: StorageDto;
    credentials?: S3CredentialDto;
};

export type BucketConnectionTest = {
    bucketName: string;
    connected: boolean;
    message: string;
};

export type FileTypeValidation = {
    bucketName: string;
    mimeType: string;
    valid: boolean;
    message: string;
};

export type ConnectionStatus = "connected" | "error" | "testing" | "unknown";

export type S3BucketWithStatus = StorageDto & {
    connectionStatus: ConnectionStatus;
};
