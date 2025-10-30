import { S3BucketDto } from "../../dto/S3BucketDto";
import { EncryptedStorageDto } from "../../dto/EncryptedStorageDto";
import { DbService } from "../../db/db.service";
import { S3Service } from "../../s3/s3.service";
import { encrypt, decrypt } from "../../util/encryption";
import { v4 as uuidv4 } from "uuid";
import * as Minio from "minio";

/**
 * Creates an S3 client from encrypted credential reference
 */
async function createS3ClientFromCredentialId(
    credentialId: string,
    db: DbService,
    s3Service: S3Service,
): Promise<Minio.Client> {
    const encryptedStorageResult = await db.getDoc(credentialId);
    if (!encryptedStorageResult.docs || encryptedStorageResult.docs.length === 0) {
        throw new Error(`Encrypted storage document not found: ${credentialId}`);
    }

    const encryptedStorage = encryptedStorageResult.docs[0];
    const decryptedAccessKey = await decrypt(encryptedStorage.data.accessKey);
    const decryptedSecretKey = await decrypt(encryptedStorage.data.secretKey);

    // Use S3Service to create the client (eliminates duplication)
    return s3Service.createClient({
        endpoint: encryptedStorage.data.endpoint,
        accessKey: decryptedAccessKey,
        secretKey: decryptedSecretKey,
    });
}

/**
 * Processes S3 bucket documents
 * @param doc - The S3 bucket document to process
 * @param _prevDoc - The previous version of the document (if any)
 * @param db - Database service
 * @param s3 - S3 service (for fallback operations)
 * @returns Array of warnings (if any)
 */
export default async function processStorageDto(
    doc: S3BucketDto,
    _prevDoc: S3BucketDto | undefined,
    db: DbService,
    s3: S3Service, // Required - no longer optional
): Promise<string[]> {
    const warnings: string[] = [];

    // Handle bucket deletion
    if (doc.deleteReq) {
        try {
            let s3Client: Minio.Client;

            // Get S3 client using the existing credentials
            if (_prevDoc?.credential_id) {
                s3Client = await createS3ClientFromCredentialId(_prevDoc.credential_id, db, s3);
            } else if (_prevDoc?.credential?.accessKey && _prevDoc?.credential?.secretKey) {
                s3Client = s3.createClient({
                    endpoint: _prevDoc.credential.endpoint,
                    accessKey: _prevDoc.credential.accessKey,
                    secretKey: _prevDoc.credential.secretKey,
                });
            } else {
                warnings.push(
                    `Warning: Cannot delete physical S3 bucket '${doc.name}' - no credentials available`,
                );
                return warnings;
            }

            // Check if bucket exists
            const bucketExists = await s3Client.bucketExists(doc.name);
            if (!bucketExists) {
                warnings.push(`Physical S3 bucket ${doc.name} does not exist, skipping deletion`);
                return warnings;
            }

            // Check if bucket has objects
            const objectStream = s3Client.listObjects(doc.name);
            let hasObjects = false;

            try {
                const iterator = objectStream[Symbol.asyncIterator]();
                const { done } = await iterator.next();
                hasObjects = !done;
            } catch (error) {
                // If we can't list objects, assume bucket is empty
                hasObjects = false;
            }

            if (hasObjects) {
                // Force delete: remove all objects first
                const objectsToDelete: string[] = [];
                const objectStream2 = s3Client.listObjects(doc.name);

                for await (const obj of objectStream2) {
                    if (obj.name) {
                        objectsToDelete.push(obj.name);
                    }
                }

                if (objectsToDelete.length > 0) {
                    await s3Client.removeObjects(doc.name, objectsToDelete);
                    warnings.push(
                        `Successfully removed ${objectsToDelete.length} file(s) from S3 bucket '${doc.name}' before deletion`,
                    );
                }
            }

            // Delete the empty bucket
            await s3Client.removeBucket(doc.name);
        } catch (error) {
            if (error.message.startsWith("BUCKET_NOT_EMPTY:")) {
                // Re-throw bucket not empty errors for frontend handling
                throw error;
            } else {
                // Log other errors as warnings but don't fail the deletion
                const errorMessage = `Failed to delete physical S3 bucket '${doc.name}': ${error.message}`;
                warnings.push(errorMessage);
                console.warn(errorMessage);
            }
        } finally {
            // ALWAYS delete the encrypted credential storage if it exists, even if bucket deletion failed
            if (_prevDoc?.credential_id) {
                try {
                    await db.deleteDoc(_prevDoc.credential_id);
                } catch (error) {
                    warnings.push(
                        `Warning: Failed to delete encrypted credential storage: ${error.message}`,
                    );
                }
            }
        }

        return warnings; // No need to process further for deletion
    }

    // Handle credential updates for existing buckets
    if (doc.credential && doc.credential_id && _prevDoc?.credential_id) {
        // This is an update to existing bucket credentials
        warnings.push(
            "Updating credentials for existing bucket. Old encrypted credentials will be deleted.",
        );

        // Delete the old encrypted credential document
        try {
            await db.deleteDoc(_prevDoc.credential_id);
            warnings.push(
                `Old encrypted credential document ${_prevDoc.credential_id} has been deleted`,
            );
        } catch (error) {
            warnings.push(
                `Warning: Failed to delete old encrypted credential document: ${error.message}`,
            );
        }

        // Remove the old credential_id reference so new credentials will be processed
        delete doc.credential_id;
    }

    // If both are provided (but not an update), prefer embedded credentials and remove credential_id reference
    if (doc.credential && doc.credential_id) {
        warnings.push(
            "Both embedded credentials and credential_id provided. Using embedded credentials and removing credential_id reference.",
        );
        // Remove the credential_id to prevent conflicts
        delete doc.credential_id;
    }

    // Validate that we have credentials
    if (!doc.credential && !doc.credential_id) {
        throw new Error(
            "S3 bucket must have either embedded credentials or a credential_id reference",
        );
    }

    // Create the physical S3 bucket ONLY for new buckets (when _prevDoc is undefined)
    // For updates, skip bucket creation since the bucket already exists
    const isNewBucket = !_prevDoc;

    if (isNewBucket) {
        try {
            let s3Client: Minio.Client;

            if (doc.credential?.accessKey && doc.credential?.secretKey) {
                // Use embedded credentials (for new buckets)
                s3Client = s3.createClient({
                    endpoint: doc.credential.endpoint,
                    accessKey: doc.credential.accessKey,
                    secretKey: doc.credential.secretKey,
                });
            } else {
                throw new Error("No S3 credentials available for bucket creation");
            }

            // Check if bucket already exists
            const bucketExists = await s3Client.bucketExists(doc.name);

            if (!bucketExists) {
                // set the policy of the bucket
                const bucketPolicy = {
                    Version: "2012-10-17",
                    Statement: [
                        {
                            Action: ["s3:GetObject"],
                            Effect: "Allow",
                            Principal: {
                                AWS: ["*"],
                            },
                            Resource: [`arn:aws:s3:::${doc.name}/*`],
                            Sid: "",
                        },
                    ],
                };

                // Create the physical bucket
                await s3Client.makeBucket(doc.name);

                // set the policy
                await s3Client.setBucketPolicy(doc.name, JSON.stringify(bucketPolicy));
            } else {
                throw new Error(`S3 bucket ${doc.name} already exists on the storage provider.`);
            }
        } catch (error) {
            // For new buckets, fail hard - don't save the document if we can't create the physical bucket
            throw new Error(`Failed to create physical S3 bucket ${doc.name}: ${error.message}`);
        }
    }

    // Only after physical bucket is created successfully, encrypt and save credentials
    if (doc.credential && !doc.credential_id) {
        try {
            // Encrypt the credentials
            const encryptedAccessKey = await encrypt(doc.credential.accessKey);
            const encryptedSecretKey = await encrypt(doc.credential.secretKey);

            // Create encrypted storage document
            const storageDoc = new EncryptedStorageDto();

            storageDoc._id = uuidv4();
            storageDoc.data = {
                endpoint: doc.credential.endpoint,
                accessKey: encryptedAccessKey,
                secretKey: encryptedSecretKey,
            };

            // Save the storage document
            const savedStorage = await db.upsertDoc(storageDoc);

            // Reference the storage document and remove embedded credentials
            doc.credential_id = savedStorage.id;

            // Remove embedded credentials to avoid storing them in plain text
            delete doc.credential;
        } catch (error) {
            throw new Error(`Failed to encrypt S3 credentials: ${error.message}`);
        }
    }

    return warnings;
}
