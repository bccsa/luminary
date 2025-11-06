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

<<<<<<< HEAD:cms/src/types/storage.ts
/**
 * S3 Bucket with connection status
 */
export type S3BucketWithStatus = StorageDto & {
=======
export type S3BucketWithStatus = S3BucketDto & {
>>>>>>> parent of 9dbc7dd9 (Refactor code structure for improved readability and maintainability):cms/src/types/s3.ts
    connectionStatus: ConnectionStatus;
};
