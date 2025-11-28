import { DbService } from "../db.service";
import { DocType, StorageType, Uuid } from "../../enums";
import { StorageDto } from "../../dto/StorageDto";
import { S3CredentialDto } from "../../dto/S3CredentialDto";
import { storeCryptoData } from "../../util/encryption";
import { v4 as uuidv4 } from "uuid";

/**
 * Upgrade the database schema from version 8 to 9
 * Create a StorageDto document with S3 credentials from environment variables
 * and update Post and Tag documents with imageBucketId field
 */
export default async function (db: DbService) {
    const schemaVersion = await db.getSchemaVersion();
    if (schemaVersion == 8) {
        console.info("Upgrading database schema from version 8 to 9");

        // Get S3 credentials from environment variables with defaults for local development
        const s3Endpoint = process.env.S3_ENDPOINT;
        const s3Port = process.env.S3_PORT;
        const s3AccessKey = process.env.S3_ACCESS_KEY;
        const s3SecretKey = process.env.S3_SECRET_KEY;
        const s3BucketName = process.env.S3_BUCKET_NAME;
        const s3PublicUrl = process.env.S3_PUBLIC_URL;

        // Construct the full endpoint URL
        const endpointUrl =
            s3Endpoint && (s3Endpoint.startsWith("http://") || s3Endpoint.startsWith("https://"))
                ? s3Endpoint
                : `http://${s3Endpoint}:${s3Port}`;

        // Check if a storage document already exists for images
        let imageStorageId: Uuid | undefined;
        try {
            // Try to find existing image storage
            const existingResult = await db.getDocsByType(DocType.Storage, 100);
            if (existingResult.docs && existingResult.docs.length > 0) {
                // Find the first image storage type
                const imageStorage = existingResult.docs.find(
                    (doc: any) => doc.storageType === StorageType.Image,
                );
                if (imageStorage) {
                    imageStorageId = imageStorage._id;
                    console.info(`Using existing image storage bucket: ${imageStorageId}`);
                }
            }
        } catch (error) {
            // If query fails, we'll create a new one
            console.info("No existing image storage found, creating new one");
        }

        // Create StorageDto if it doesn't exist
        if (!imageStorageId) {
            // Create S3 credentials
            const credentials: S3CredentialDto = {
                endpoint: endpointUrl,
                bucketName: s3BucketName,
                accessKey: s3AccessKey,
                secretKey: s3SecretKey,
            };

            // Encrypt and store credentials
            const credentialId = await storeCryptoData<S3CredentialDto>(db, credentials);

            // Create StorageDto document
            const storageDoc = new StorageDto();
            storageDoc._id = uuidv4();
            storageDoc.type = DocType.Storage;
            storageDoc.name = "Default Image Storage";
            storageDoc.storageType = StorageType.Image;
            storageDoc.publicUrl = s3PublicUrl;
            storageDoc.mimeTypes = ["image/*"];
            storageDoc.memberOf = []; // Empty memberOf array - can be updated later via CMS
            storageDoc.credential_id = credentialId;

            // Save the storage document
            await db.upsertDoc(storageDoc);
            imageStorageId = storageDoc._id;
            console.info(`Created new image storage bucket: ${imageStorageId}`);
        }

        // Update all Post and Tag documents with imageBucketId
        await db.processAllDocs([DocType.Post, DocType.Tag], async (doc: any) => {
            if (doc) {
                if (!doc.imageBucketId) {
                    doc.imageBucketId = imageStorageId;
                    await db.upsertDoc(doc);
                }
            }
        });

        await db.setSchemaVersion(9);
        console.info("Database schema upgrade from version 8 to 9 completed");
    }
}

