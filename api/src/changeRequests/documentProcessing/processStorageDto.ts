import { S3BucketDto } from "../../dto/S3BucketDto";
import { EncryptedStorageDto } from "../../dto/EncryptedStorageDto";
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
    doc: S3BucketDto,
    _prevDoc: S3BucketDto | undefined,
    db: DbService,
): Promise<string[]> {
    const warnings: string[] = [];

    // If the document has embedded credentials, encrypt them and create a storage document
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
    } else if (!doc.credential && !doc.credential_id) {
        throw new Error(
            "S3 bucket must have either embedded credentials or a credential_id reference",
        );
    }

    // If both are provided, prefer credential_id and warn about embedded credentials
    if (doc.credential && doc.credential_id) {
        throw new Error(
            "S3 bucket has both embedded credentials and credential_id. Using credential_id reference.",
        );
    }

    return warnings;
}
