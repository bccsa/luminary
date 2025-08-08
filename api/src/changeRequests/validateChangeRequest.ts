import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { ContentDto } from "../dto/ContentDto";
import { GroupDto } from "../dto/GroupDto";
import { LanguageDto } from "../dto/LanguageDto";
import { PostDto } from "../dto/PostDto";
import { TagDto } from "../dto/TagDto";
import { UserDto } from "../dto/UserDto";
import { DocType, Uuid } from "../enums";
import { ValidationResult } from "./ValidationResult";
import { DbService } from "../db/db.service";
import { validateChangeRequestAccess } from "./validateChangeRequestAccess";
import { validateAcl } from "./aclValidation";
import { RedirectDto } from "../dto/RedirectDto";
import { S3Service } from "../s3/s3.service";
import * as sharp from "sharp";

/**
 * DocType to DTO map
 */
const DocTypeMap = {
    content: ContentDto,
    group: GroupDto,
    language: LanguageDto,
    redirect: RedirectDto,
    post: PostDto,
    tag: TagDto,
    user: UserDto,
};

/**
 * Validates a change request received from a CMS / client
 * @param data
 * @param groupMembership
 * @param dbService
 * @param s3Service
 */
export async function validateChangeRequest(
    data: any,
    groupMembership: Array<Uuid>,
    dbService: DbService,
    s3Service?: S3Service,
): Promise<ValidationResult> {
    const changeRequest = plainToInstance(ChangeReqDto, data, { excludeExtraneousValues: true });

    // Validate main change request document
    let message = "Change request validation failed for the following constraints:\n";
    let validationResult = await dtoValidate(changeRequest, message);

    if (!validationResult.validated) {
        return validationResult;
    }

    // Check included document existence and type validity
    if (!changeRequest.doc.type || !Object.values(DocType).includes(changeRequest.doc.type)) {
        return {
            validated: false,
            error: `Submitted "${changeRequest.doc.type}" document validation failed:\nInvalid document type`,
        };
    }

    if (changeRequest.doc.type == DocType.Redirect) {
        const currentDoc = changeRequest.doc as RedirectDto;
        const slugIsUnique = await dbService.checkUniqueSlug(
            currentDoc.slug,
            currentDoc._id,
            DocType.Redirect,
        );
        if (!slugIsUnique) {
            return {
                validated: false,
                error: `Submitted "${changeRequest.doc.type}" document validation failed:\nSlug already has a redirect`,
            };
        }
    }

    // Check included document validity
    const doc = plainToInstance(DocTypeMap[changeRequest.doc.type], changeRequest.doc, {
        excludeExtraneousValues: true,
    });
    message = `Submitted ${changeRequest.doc.type} document validation failed for the following constraints:\n`;
    validationResult = await dtoValidate(doc, message);

    if (!validationResult.validated) {
        return validationResult;
    }

    // Validate and compact ACL's in Group Documents
    if (changeRequest.doc.type === DocType.Group) {
        const groupDoc = changeRequest.doc as GroupDto;
        groupDoc.acl = validateAcl(groupDoc.acl);
    }

    // Replace the included document in the change request with the validated document
    changeRequest.doc = doc;

    // Validate access
    const accessValidationResult = await validateChangeRequestAccess(
        changeRequest,
        groupMembership,
        dbService,
    );
    if (!accessValidationResult.validated) {
        return accessValidationResult;
    }

    // Validate images if S3Service is available and document has images
    const warnings: string[] = [];
    if (s3Service && hasImages(doc)) {
        const imageWarnings = await validateImageProcessing(doc, s3Service);
        warnings.push(...imageWarnings);
    }

    return {
        validated: true,
        validatedData: changeRequest.doc,
        warnings: warnings.length > 0 ? warnings : undefined,
    };
}

async function dtoValidate(data: any, message: string): Promise<ValidationResult> {
    // Try-catch is needed to handle nested validation errors (specifically for arrays?) which throws an exception instead of giving a meaningful validation result.
    // TODO: Might be possible to work around the exception according to https://dev.to/avantar/validating-nested-objects-with-class-validator-in-nestjs-1gn8 (see comments) - but seems like they are just handling the error in any case.
    try {
        const changeReqValidation = await validate(data, {
            whitelist: true,
            forbidNonWhitelisted: true,
        });
        if (changeReqValidation.length > 0) {
            changeReqValidation.forEach((c) => {
                if (c.constraints) {
                    message += Object.values(c.constraints).join("\n") + "\n";
                } else {
                    message += c.toString() + "\n";
                }
            });
            return {
                validated: false,
                error: message,
            };
        }
    } catch (err) {
        message += err.message;
        return {
            validated: false,
            error: message,
        };
    }

    return {
        validated: true,
    };
}

/**
 * Check if a document has images
 */
function hasImages(doc: any): boolean {
    return (
        (doc.type === DocType.Post || doc.type === DocType.Tag) &&
        doc.imageData &&
        doc.imageData.uploadData &&
        doc.imageData.uploadData.length > 0
    );
}

const imageFailureMessage = "Image processing validation failed:\n";

/**
 * Validate image processing without failing the document validation
 */
async function validateImageProcessing(doc: any, s3Service: S3Service): Promise<string[]> {
    const warnings: string[] = [];

    try {
        // Check if S3/Minio is connected
        const isConnected = await s3Service.checkConnection();
        if (!isConnected) {
            warnings.push(
                imageFailureMessage +
                    "Image upload service is not connected. Images will not be processed.\n",
            );
            return warnings;
        }

        // Check if image bucket exists
        const bucketExists = await s3Service.bucketExists(s3Service.imageBucket);
        if (!bucketExists) {
            warnings.push(
                imageFailureMessage +
                    `Image bucket '${s3Service.imageBucket}' does not exist. Images will not be processed.`,
            );
            return warnings;
        }

        // Validate each image upload
        if (doc.imageData && doc.imageData.uploadData) {
            for (const uploadData of doc.imageData.uploadData) {
                const imageWarnings = await validateSingleImage(uploadData);
                warnings.push(...imageWarnings);
            }
        }

        // Validate existing images if any
        if (doc.imageData && doc.imageData.fileCollections) {
            const imageWarnings = await validateImagesInContent(
                doc.imageData.fileCollections,
                s3Service,
            );
            warnings.push(...imageWarnings);
        }
    } catch (error) {
        warnings.push(`Image validation failed: ${error.message}`);
    }

    return warnings;
}

/**
 * Validate a single image upload
 */
async function validateSingleImage(uploadData: any): Promise<string[]> {
    const warnings: string[] = [];

    try {
        if (!uploadData.fileData || uploadData.fileData.length === 0) {
            warnings.push(imageFailureMessage + "Image data is empty or invalid\n");
            return warnings;
        }

        // Try to process a test version to ensure the image data is valid
        // This doesn't actually upload, just validates the data can be processed
        const metadata = await sharp(uploadData.fileData).metadata();

        if (!metadata.width || !metadata.height) {
            warnings.push(imageFailureMessage + "Invalid image: unable to determine dimensions\n");
        }

        if (metadata.width < 100 || metadata.height < 100) {
            warnings.push(
                imageFailureMessage +
                    `Image is very small (${metadata.width}x${metadata.height}px). Consider using a larger image for better quality.`,
            );
        }
    } catch (error) {
        warnings.push(imageFailureMessage + `Image processing failed: ${error.message}`);
    }

    return warnings;
}

/**
 * Validate existing images in file collections
 */
async function validateImagesInContent(
    fileCollections: any[],
    s3Service: S3Service,
): Promise<string[]> {
    const warnings: string[] = [];

    try {
        const allFilenames = fileCollections.flatMap(
            (collection) => collection.imageFiles?.map((file: any) => file.filename) || [],
        );

        if (allFilenames.length > 0) {
            const inaccessibleImages = await s3Service.checkImageAccessibility(
                s3Service.imageBucket,
                allFilenames,
            );
            if (inaccessibleImages.length > 0) {
                warnings.push(`Some images are not accessible: ${inaccessibleImages.join(", ")}`);
            }
        }
    } catch (error) {
        warnings.push(`Failed to validate existing images: ${error.message}`);
    }

    return warnings;
}
