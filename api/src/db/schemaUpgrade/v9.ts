import { DbService } from "../db.service";
import { DocType, StorageType, Uuid } from "../../enums";
import { StorageDto } from "../../dto/StorageDto";
import { S3CredentialDto } from "../../dto/S3CredentialDto";
import { storeCryptoData } from "../../util/encryption";
import { v4 as uuidv4 } from "uuid";
import { S3Service } from "../../s3/s3.service";

/**
 * Helper function to format error messages consistently
 */
function formatError(message: string, error: any): string {
    return `${message}: ${error?.message || error}`;
}

/**
 * Upgrade the database schema from version 8 to 9
 * Create a StorageDto document with S3 credentials from environment variables
 * and update Post and Tag documents with imageBucketId field, propagating to content children
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion === 8) {
            console.info("Upgrading database schema from version 8 to 9");

            // Get S3 credentials from environment variables with defaults for local development
            const s3Endpoint = process.env.S3_ENDPOINT;
            const s3Port = process.env.S3_PORT;
            const s3AccessKey = process.env.S3_ACCESS_KEY;
            const s3SecretKey = process.env.S3_SECRET_KEY;
            const s3BucketName = process.env.S3_IMG_BUCKET;
            const s3UseSSL = process.env.S3_USE_SSL === "true";

            // Validate required environment variables
            if (!s3Endpoint) {
                throw new Error(
                    "S3_ENDPOINT environment variable is required for schema upgrade v9",
                );
            }
            if (!s3Port && !s3UseSSL) {
                throw new Error(
                    "S3_PORT environment variable is required when S3_USE_SSL is not true",
                );
            }
            if (!s3BucketName) {
                throw new Error(
                    "S3_IMG_BUCKET environment variable is required for schema upgrade v9",
                );
            }

            // Construct the full endpoint URL
            const endpointUrl = s3UseSSL
                ? `https://${s3Endpoint}`
                : `http://${s3Endpoint}:${s3Port}`;

            // Check if a storage document already exists for images
            let imageStorageId: Uuid | undefined;
            let existingStorageDoc: any = null;
            try {
                // Try to find existing image storage
                const existingResult = await db.getDocsByType(DocType.Storage, 100);
                if (existingResult.docs && existingResult.docs.length > 0) {
                    // Find the first image storage type
                    existingStorageDoc = existingResult.docs.find(
                        (doc: any) => doc.storageType === StorageType.Image,
                    );
                    if (existingStorageDoc) {
                        imageStorageId = existingStorageDoc._id;
                        console.info(`Found existing image storage document: ${imageStorageId}`);
                    }
                }
            } catch (error) {
                // If query fails, we'll create a new one
                console.info("No existing image storage found, creating new one");
            }

            // Validate S3 credentials from environment variables
            if (!s3AccessKey || !s3SecretKey) {
                throw new Error(
                    "S3_ACCESS_KEY and S3_SECRET_KEY environment variables are required for schema upgrade v9",
                );
            }

            // Create S3 credentials from current environment variables
            const credentials: S3CredentialDto = {
                endpoint: endpointUrl,
                bucketName: s3BucketName,
                accessKey: s3AccessKey,
                secretKey: s3SecretKey,
            };

            // Create StorageDto if it doesn't exist, or update existing one with fresh credentials
            if (!imageStorageId) {
                console.info("Creating new storage document with S3 credentials");

                // Encrypt and store credentials
                let credentialId: string;
                try {
                    credentialId = await storeCryptoData<S3CredentialDto>(db, credentials);
                } catch (error) {
                    console.error("Failed to store encrypted S3 credentials:", error);
                    throw new Error(formatError("Failed to store encrypted S3 credentials", error));
                }

                // Create StorageDto document
                const storageDoc = new StorageDto();
                storageDoc._id = uuidv4();
                storageDoc.type = DocType.Storage;
                storageDoc.name = "images";
                storageDoc.storageType = StorageType.Image;
                storageDoc.publicUrl = `${endpointUrl}/${s3BucketName}`;
                storageDoc.mimeTypes = ["image/*"];
                storageDoc.memberOf = ["group-super-admins"];
                storageDoc.credential_id = credentialId;

                // Save the storage document
                try {
                    await db.upsertDoc(storageDoc);
                    imageStorageId = storageDoc._id;
                    console.info(`Created new image storage document: ${imageStorageId}`);
                } catch (error) {
                    console.error("Failed to save storage document:", error);
                    throw new Error(formatError("Failed to save storage document", error));
                }
            } else {
                // Update existing storage document with fresh credentials from environment
                console.info("Updating existing storage document with fresh credentials");

                // Delete old credential document if it exists
                if (existingStorageDoc.credential_id) {
                    try {
                        await db.deleteDoc(existingStorageDoc.credential_id);
                    } catch (error) {
                        console.warn(`Could not delete old credentials: ${error}`);
                    }
                }

                // Store new credentials
                let credentialId: string;
                try {
                    credentialId = await storeCryptoData<S3CredentialDto>(db, credentials);
                } catch (error) {
                    console.error("Failed to store encrypted S3 credentials:", error);
                    throw new Error(formatError("Failed to store encrypted S3 credentials", error));
                }

                // Update the storage document
                existingStorageDoc.credential_id = credentialId;
                existingStorageDoc.publicUrl = `${endpointUrl}/${s3BucketName}`;
                try {
                    await db.upsertDoc(existingStorageDoc);
                    // Clear S3Service cache so it picks up new credentials
                    S3Service.clearCache(imageStorageId);
                } catch (error) {
                    console.error("Failed to update storage document:", error);
                    console.error(error);
                    throw new Error(formatError("Failed to update storage document", error));
                }
            }

            // Ensure the actual bucket exists in MinIO/S3 (for both new and existing storage documents)
            if (imageStorageId) {
                try {
                    const s3Service = await S3Service.create(imageStorageId, db);

                    // Check if bucket already exists, create if not
                    const bucketExists = await s3Service.bucketExists();
                    if (!bucketExists) {
                        await s3Service.makeBucket();
                    }

                    // Always set public read policy (ensures it's set even for existing buckets)
                    const bucketPolicy = {
                        Version: "2012-10-17",
                        Statement: [
                            {
                                Sid: "PublicRead",
                                Effect: "Allow",
                                Principal: { AWS: ["*"] },
                                Action: ["s3:GetObject"],
                                Resource: [`arn:aws:s3:::${s3BucketName}/*`],
                            },
                        ],
                    };
                    await s3Service
                        .getClient()
                        .setBucketPolicy(s3BucketName, JSON.stringify(bucketPolicy));
                } catch (error) {
                    console.error("Failed to verify/create bucket in MinIO:", error);
                    throw new Error(formatError("Failed to verify/create bucket in MinIO", error));
                }
            }

            // Update all Post and Tag documents with imageBucketId and propagate to their content children
            console.info("Updating Post and Tag documents with imageBucketId");
            let updatedCount = 0;
            let contentUpdatedCount = 0;

            try {
                await db.processAllDocs([DocType.Post, DocType.Tag], async (doc: any) => {
                    if (!doc) return;

                    let parentUpdated = false;

                    // Only assign a bucket if the document has processed images (fileCollections)
                    if (
                        doc.imageData &&
                        doc.imageData?.fileCollections?.length > 0 &&
                        !doc.imageBucketId &&
                        imageStorageId
                    ) {
                        doc.imageBucketId = imageStorageId;
                        parentUpdated = true;
                    }

                    if (parentUpdated) {
                        try {
                            await db.upsertDoc(doc);
                            updatedCount++;
                        } catch (error) {
                            console.error(`Failed to update document ${doc._id}:`, error);
                            // Continue with other documents even if one fails
                        }
                    }

                    // Ensure child content documents point to the same bucket for their parent images
                    // Only process if parent has processed images (fileCollections)
                    if (
                        doc.imageData &&
                        doc.imageData?.fileCollections?.length > 0 &&
                        doc.imageBucketId
                    ) {
                        try {
                            const childContents = await db.getContentByParentId(doc._id);
                            if (childContents.docs?.length) {
                                for (const contentDoc of childContents.docs) {
                                    if (contentDoc.parentImageBucketId !== doc.imageBucketId) {
                                        contentDoc.parentImageBucketId = doc.imageBucketId;
                                        try {
                                            await db.upsertDoc(contentDoc);
                                            contentUpdatedCount++;
                                        } catch (error) {
                                            console.error(
                                                `Failed to update content document ${contentDoc._id}:`,
                                                error,
                                            );
                                            // Continue with other documents even if one fails
                                        }
                                    }
                                }
                            }
                        } catch (error) {
                            console.error(`Failed to get content for parent ${doc._id}:`, error);
                            // Continue with other documents even if one fails
                        }
                    }
                });

                console.info(
                    `Updated ${updatedCount} Post/Tag documents and ${contentUpdatedCount} Content documents`,
                );
            } catch (error) {
                console.error("Failed to process Post and Tag documents:", error);
                throw new Error(formatError("Failed to process Post and Tag documents", error));
            }

            // Only set schema version to 9 if all operations succeeded
            await db.setSchemaVersion(9);
            console.info("Database schema upgrade from version 8 to 9 completed successfully");
        } else {
            console.info(
                `Skipping schema upgrade v9: current version is ${schemaVersion}, expected 8`,
            );
        }
    } catch (error) {
        console.error("Database schema upgrade from version 8 to 9 failed:", error);
        throw error; // Re-throw to prevent schema version from being updated
    }
}
