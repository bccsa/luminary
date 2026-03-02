import { OAuthProviderDto } from "../../dto/OAuthProviderDto";
import { DbService } from "../../db/db.service";
import { processImage } from "./processImageDto";

/** Group that grants public (logged-out) view access; OAuthProvider docs must include it so providers are listable before login. */
const PUBLIC_CONTENT_GROUP_ID = "group-public-content";

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
                                        (c) => c.imageFiles ?? [],
                                    ) ?? [];

                                if (allImageFiles.length > 0) {
                                    // Find smallest image
                                    const smallest = allImageFiles.reduce(
                                        (a, b) => (a.width <= b.width ? a : b),
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

    // OAuthProvider documents are always public so logged-out users can list providers and log in
    if (!Array.isArray(doc.memberOf)) {
        doc.memberOf = [];
    }
    if (!doc.memberOf.includes(PUBLIC_CONTENT_GROUP_ID)) {
        doc.memberOf = [...doc.memberOf, PUBLIC_CONTENT_GROUP_ID];
    }

    return warnings;
}
