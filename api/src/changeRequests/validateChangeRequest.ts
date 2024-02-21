import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { ChangeDto } from "../dto/ChangeDto";
import { ChangeReqAckDto } from "../dto/ChangeReqAckDto";
import { ContentDto } from "../dto/ContentDto";
import { GroupAclEntryDto } from "../dto/GroupAclEntryDto";
import { GroupDto } from "../dto/GroupDto";
import { LanguageDto } from "../dto/LanguageDto";
import { PostDto } from "../dto/PostDto";
import { TagDto } from "../dto/TagDto";
import { UserDto } from "../dto/UserDto";
import { DocType } from "../enums";
import { ValidationResult } from "./ValidationResult";

/**
 * DocType to DTO map
 */
const DocTypeMap = {
    change: ChangeDto,
    changeReq: ChangeReqDto,
    changeReqAck: ChangeReqAckDto,
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
export async function validateChangeRequest(data: any): Promise<ValidationResult> {
    const changeReq = plainToInstance(ChangeReqDto, data);

    // Validate main change request document
    let message = "Change request validation failed for the following constraints:\n";
    const validationResult = await dtoValidate(changeReq, message);

    if (!validationResult.validated) {
        return validationResult;
    }

    // Validate all individual changes
    for (const change of changeReq.changes) {
        // Check included document existance and type validity
        if (!change.doc.type || !Object.values(DocType).includes(change.doc.type)) {
            return {
                validated: false,
                error: `Submitted "${change.doc.type}" document validation failed:\nInvalid document type`,
            };
        }

        // Check included document validity
        const doc = plainToInstance(DocTypeMap[change.doc.type], change.doc);

        message = `Submitted ${change.doc.type} document validation failed for the following constraints:\n`;
        const validationResult = await dtoValidate(doc, message);

        if (!validationResult.validated) {
            return validationResult;
        }
    }

    return {
        validated: true,
    };
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
