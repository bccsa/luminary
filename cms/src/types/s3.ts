// S3 Management Types
import { type S3BucketDto, type S3CredentialDto } from "luminary-shared";

export type CreateBucketRequest = {
    bucket: S3BucketDto;
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

export type S3BucketWithStatus = S3BucketDto & {
    connectionStatus: ConnectionStatus;
};
