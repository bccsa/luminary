/**
 * S3CredentialDto is intentionally exported as a plain TypeScript type (not
 * a persisted document). Instances of this type are intended to be serialized
 * and stored encrypted inside an `EncryptedStorageDto` document. Keeping this
 * as a plain type avoids class-transformer / validation semantics for stored
 * encrypted blobs.
 */
export type S3CredentialDto = {
    endpoint: string;
    bucketName?: string; // encrypted when persisted inside EncryptedStorageDto
    accessKey?: string; // encrypted when persisted inside EncryptedStorageDto
    secretKey?: string; // encrypted when persisted inside EncryptedStorageDto
};
