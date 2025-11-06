import { StorageDto } from "../../dto/StorageDto";
import { CryptoDto } from "../../dto/CryptoDto";
import { DbService } from "../../db/db.service";
import { encrypt } from "../../util/encryption";
import { v4 as uuidv4 } from "uuid";

/**
 * Processes S3 bucket documents
 * @param doc - The S3 bucket document to process
 * @param _prevDoc - The previous version of the document (if any)
 * @param db - Database service
 * @returns Array of warnings (if any)
 */
export default async function processStorageDto(
    doc: StorageDto,
    _prevDoc: StorageDto | undefined,
    db: DbService,
): Promise<string[]> {
    const warnings: string[] = [];

    // Handle bucket deletion
    if (doc.deleteReq) {
        // Delete the encrypted credential storage if it exists
        if (_prevDoc?.credential_id) {
            try {
                await db.deleteDoc(_prevDoc.credential_id);
            } catch (error) {
                warnings.push(
                    `Warning: Failed to delete encrypted credential storage: ${error.message}`,
                );
            }
        }

        return warnings; // No need to process further for deletion
    }

    // Handle credential updates for existing buckets
    if (doc.credential && doc.credential_id && _prevDoc?.credential_id) {
        // Delete the old encrypted credential document
        try {
            await db.deleteDoc(_prevDoc.credential_id);
        } catch (error) {
            warnings.push(`Warning: Failed to remove previous credentials: ${error.message}`);
        }

        // Remove the old credential_id reference so new credentials will be processed
        delete doc.credential_id;
    }

    // If both are provided (but not an update), prefer embedded credentials and remove credential_id reference
    if (doc.credential && doc.credential_id) {
        warnings.push("The previous credentials will be deleted and replaced with new ones.");

        // Remove the credential_id to prevent conflicts
        delete doc.credential_id;
    }

    // Validate that we have credentials
    if (!doc.credential && !doc.credential_id) {
        throw new Error(
            "S3 bucket must have either embedded credentials or a credential_id reference",
        );
    }

    // Process new embedded credentials if provided
    if (doc.credential && !doc.credential_id) {
        try {
            // Encrypt the credentials
            const encryptedBucketName = await encrypt(doc.credential.bucketName);
            const encryptedAccessKey = await encrypt(doc.credential.accessKey);
            const encryptedSecretKey = await encrypt(doc.credential.secretKey);

            // Create encrypted storage document
            const storageDoc = new CryptoDto();

            storageDoc._id = uuidv4();
            storageDoc.data = {
                endpoint: doc.credential.endpoint,
                bucketName: encryptedBucketName,
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
