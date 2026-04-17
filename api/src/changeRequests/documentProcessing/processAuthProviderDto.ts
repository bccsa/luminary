import { AuthProviderDto } from "../../dto/AuthProviderDto";
import { DbService } from "../../db/db.service";
import { deleteImage, processImage } from "./processImageDto";

/**
 * Process AuthProvider DTO — handles image uploads for provider icons.
 */
export default async function processAuthProviderDto(
    doc: AuthProviderDto,
    prevDoc: AuthProviderDto | undefined,
    db: DbService,
): Promise<string[]> {
    const warnings: string[] = [];

    // On delete, remove images from S3
    if (doc.deleteReq) {
        if (doc.imageData && prevDoc?.imageData) {
            const imageWarnings = await deleteImage(prevDoc.imageData, prevDoc.imageBucketId, db);
            warnings.push(...imageWarnings);
        }
        return warnings;
    }

    // Process image uploads
    if (doc.imageData) {
        let imageWarnings: string[] = [];

        if (!doc.imageBucketId) {
            imageWarnings.push("Bucket is not specified for image processing.");
        }

        try {
            const result = await processImage(
                doc.imageData,
                prevDoc?.imageData,
                db,
                doc.imageBucketId,
                prevDoc?.imageBucketId,
            );
            imageWarnings = result.warnings;

            if (result.migrationFailed && prevDoc?.imageBucketId) {
                doc.imageBucketId = prevDoc.imageBucketId;
                warnings.push(
                    "Image migration failed. Reverted to previous bucket configuration to ensure files remain accessible.",
                );
            }
        } catch (error) {
            if (prevDoc?.imageBucketId && doc.imageBucketId !== prevDoc.imageBucketId) {
                doc.imageBucketId = prevDoc.imageBucketId;
            }
            imageWarnings.push(`Bucket image processing failed: ${error.message}`);
        }

        if (imageWarnings?.length) {
            warnings.push(...imageWarnings);
        }
    }

    return warnings;
}
