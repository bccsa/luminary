import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { ContentDto } from "../dto/ContentDto";
import { GroupAclEntryDto } from "../dto/GroupAclEntryDto";
import { GroupDto } from "../dto/GroupDto";
import { LanguageDto } from "../dto/LanguageDto";
import { PostDto } from "../dto/PostDto";
import { TagDto } from "../dto/TagDto";
import { UserDto } from "../dto/UserDto";
import { DocType } from "../enums";
import { ValidationResult } from "./ValidationResult";
import { AccessMap } from "src/permissions/AccessMap";
import { DbService } from "src/db/db.service";
import { validateChangeRequestAccess } from "./validateChangeRequestAccess";

/**
 * DocType to DTO map
 */
const DocTypeMap = {
    content: ContentDto,
    group: GroupDto,
    groupAclEntry: GroupAclEntryDto,
    language: LanguageDto,
    post: PostDto,
    tag: TagDto,
    user: UserDto,
};

/**
 * Validates a change request received as a "data" message received from a CMS / client
 * @param data
 */
export async function validateChangeRequest(
    data: any,
    accessMap: AccessMap,
    dbService: DbService,
): Promise<ValidationResult> {
    const changeRequest = plainToInstance(ChangeReqDto, data);

    // Validate main change request document
    let message = "Change request validation failed for the following constraints:\n";
    let validationResult = await dtoValidate(changeRequest, message);

    if (!validationResult.validated) {
        return validationResult;
    }

    // Check included document existance and type validity
    if (!changeRequest.doc.type || !Object.values(DocType).includes(changeRequest.doc.type)) {
        return {
            validated: false,
            error: `Submitted "${changeRequest.doc.type}" document validation failed:\nInvalid document type`,
        };
    }

    // Check included document validity
    const doc = plainToInstance(DocTypeMap[changeRequest.doc.type], changeRequest.doc);

    message = `Submitted ${changeRequest.doc.type} document validation failed for the following constraints:\n`;
    validationResult = await dtoValidate(doc, message);

    if (!validationResult.validated) {
        return validationResult;
    }

    return validateChangeRequestAccess(changeRequest, accessMap, dbService);
}

async function dtoValidate(data: any, message: string): Promise<ValidationResult> {
    // Try-catch is needed to handle nested validation errors (speficially for arrays?) which throws an exception instead of giving a meaningful validation result.
    // TODO: Might be possible to work around the exception according to https://dev.to/avantar/validating-nested-objects-with-class-validator-in-nestjs-1gn8 (see comments) - but seems like they are just handling the error in any case.
    try {
        const changeReqValidation = await validate(data);
        if (changeReqValidation.length > 0) {
            changeReqValidation.forEach((c) => {
                message += Object.values(c.constraints).join("\n") + "\n";
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
