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
import { StorageDto } from "../dto/StorageDto";

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
    storage: StorageDto,
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
): Promise<ValidationResult> {
    const changeRequest = plainToInstance(ChangeReqDto, data);

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
    const doc = plainToInstance(DocTypeMap[changeRequest.doc.type], changeRequest.doc);
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

    return {
        validated: true,
        validatedData: changeRequest.doc,
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
