import { StorageDto } from "../../dto/StorageDto";
import { DbService } from "../../db/db.service";
import { storeCredentials } from "../../util/encryption";

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
        throw new Error("Missing S3 bucket credentials");
    }

    // Process new embedded credentials if provided
    if (doc.credential && !doc.credential_id) {
        try {
            // Use helper to encrypt and store credentials
            const savedId = await storeCredentials(db, doc.credential);

            // Update document to reference stored credentials
            doc.credential_id = savedId;

            // Remove embedded credentials to avoid storing them in plain text
            delete doc.credential;
        } catch (error) {
            throw new Error(`Failed to encrypt S3 credentials: ${error.message}`);
        }
    }

    return warnings;
}
