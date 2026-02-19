import { OAuthProviderDto } from "../../dto/OAuthProviderDto";
import { DbService } from "../../db/db.service";
import { storeCryptoData } from "../../util/encryption";
import { Auth0CredentialSecretsDto } from "../../dto/Auth0CredentialsDto";
import { processImage } from "./processImageDto";

/**
 * Processes OAuth provider documents.
 * Handles credential encryption similar to Storage documents.
 * @param doc - The OAuth provider document to process
 * @param prevDoc - The previous version of the document (if any)
 * @param db - Database service
 * @returns Array of warnings (if any)
 */
export default async function processOAuthProviderDto(
    doc: OAuthProviderDto,
    prevDoc: OAuthProviderDto | undefined,
    db: DbService,
): Promise<string[]> {
    const warnings: string[] = [];

    // Handle deletion
    if (doc.deleteReq) {
        // Delete the encrypted credential storage if it exists
        if (prevDoc?.credential_id) {
            try {
                await db.deleteDoc(prevDoc.credential_id);
            } catch (error) {
                warnings.push(
                    `Warning: Failed to delete encrypted credential storage: ${error.message}`,
                );
            }
        }

        // Remove images from S3
        if (doc.imageData) {
            const imageResult = await processImage(
                { fileCollections: [] },
                prevDoc?.imageData,
                db,
                prevDoc?.imageBucketId,
            );
            if (imageResult?.warnings?.length > 0) {
                warnings.push(...imageResult.warnings);
            }
        }

        return warnings;
    }

    // Handle credential updates for existing providers
    if (doc.credential && doc.credential_id && prevDoc?.credential_id) {
        // Delete the old encrypted credential document (best-effort: conflicts are fine
        // since the document is being replaced regardless)
        await db.deleteDoc(prevDoc.credential_id);

        // Remove the old credential_id reference so new credentials will be processed
        delete doc.credential_id;
    }

    // If both are provided (but not an update), prefer embedded credentials
    if (doc.credential && doc.credential_id) {
        warnings.push(
            "The previous credentials will be deleted and replaced with new ones.",
        );
        delete doc.credential_id;
    }

    // Validate that we have credentials
    if (!doc.credential && !doc.credential_id) {
        throw new Error("Missing OAuth provider credentials");
    }

    // Process new embedded credentials if provided
    if (doc.credential && !doc.credential_id) {
        try {
            // Store only the secret in the crypto document; public config stays on the doc
            const cryptoPayload = { clientSecret: doc.credential.clientSecret };
            const savedId = await storeCryptoData<Auth0CredentialSecretsDto>(
                db,
                cryptoPayload,
            );

            doc.credential_id = savedId;

            // Set public fields on the document (already on OAuthProviderDto)
            doc.domain = doc.credential.domain;
            doc.clientId = doc.credential.clientId;
            doc.audience = doc.credential.audience;

            delete doc.credential;
        } catch (error) {
            throw new Error(
                `Failed to encrypt OAuth credentials: ${error.message}`,
            );
        }
    }

    // Process image uploads
    if (doc.imageData) {
        if (!doc.imageBucketId) {
            warnings.push("Bucket is not specified for image processing.");
        } else {
            try {
                const result = await processImage(
                    doc.imageData,
                    prevDoc?.imageData,
                    db,
                    doc.imageBucketId,
                    prevDoc?.imageBucketId,
                );
                if (result?.warnings?.length > 0) {
                    warnings.push(...result.warnings);
                }

                // Generate and store public icon URL
                if (doc.imageBucketId) {
                    try {
                        const bucketResult = await db.getDoc(doc.imageBucketId);
                        if (bucketResult.docs && bucketResult.docs.length > 0) {
                            const bucket = bucketResult.docs[0]; // Assuming StorageDto structure
                            if (bucket && bucket.publicUrl) {
                                let filename: string | undefined;
                                const allImageFiles =
                                    doc.imageData.fileCollections?.flatMap(
                                        (c: any) => c.imageFiles,
                                    ) ?? [];

                                if (allImageFiles.length > 0) {
                                    // Find smallest image
                                    const smallest = allImageFiles.reduce(
                                        (a: any, b: any) =>
                                            a.width <= b.width ? a : b,
                                    );
                                    filename = smallest.filename;
                                } else if (
                                    doc.imageData.uploadData &&
                                    doc.imageData.uploadData.length > 0
                                ) {
                                    filename =
                                        doc.imageData.uploadData[0].filename;
                                }

                                if (filename) {
                                    const baseUrl = bucket.publicUrl.replace(
                                        /\/$/,
                                        "",
                                    );
                                    const safeFilename = filename.replace(
                                        /^\//,
                                        "",
                                    );
                                    doc.icon = `${baseUrl}/${safeFilename}`;
                                }
                            }
                        }
                    } catch (e) {
                        // Ignore icon generation errors, just log warning
                        warnings.push(
                            `Warning: Failed to generate icon URL: ${e.message}`,
                        );
                    }
                }
            } catch (error) {
                warnings.push(`Image processing failed: ${error.message}`);
            }
        }
    }

    return warnings;
}
