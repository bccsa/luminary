import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ChangeReqDto } from "./dto/ChangeReqDto";
import { ChangeDto } from "./dto/ChangeDto";
import { ChangeReqAckDto } from "./dto/ChangeReqAckDto";
import { ContentDto } from "./dto/ContentDto";
import { GroupAclEntryDto } from "./dto/GroupAclEntryDto";
import { GroupDto } from "./dto/GroupDto";
import { LanguageDto } from "./dto/LanguageDto";
import { PostDto } from "./dto/PostDto";
import { TagDto } from "./dto/TagDto";
import { UserDto } from "./dto/UserDto";
import { DocType } from "./enums";

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
export async function validateChangeReq(data: any): Promise<string> {
    // Validate change request document
    const changeReq = plainToInstance(ChangeReqDto, data);
    const changeReqValidation = await validate(changeReq);
    if (changeReqValidation.length > 0) {
        let message = "Change request validation failed for the following constraints:\n";
        changeReqValidation.forEach((c) => {
            message += Object.values(c.constraints).join("\n") + "\n";
        });
        return message;
    }

    // Check included document existance and type validity
    if (!changeReq.doc.type || !Object.values(DocType).includes(changeReq.doc.type)) {
        return `Submitted "${changeReq.doc.type}" document validation failed:\nInvalid document type`;
    }

    // Check included document validity
    const doc = plainToInstance(DocTypeMap[changeReq.doc.type], changeReq.doc);
    let message = `Submitted ${changeReq.doc.type} document validation failed for the following constraints:\n`;
    // Try-catch is needed to handle nested validation errors (speficially for arrays?) which throws an exception instead of giving a meaningful validation result.
    // TODO: Might be possible to work around the exception according to https://dev.to/avantar/validating-nested-objects-with-class-validator-in-nestjs-1gn8 (see comments) - but seems like they are just handling the error in any case.
    try {
        const docValidation = await validate(doc);
        if (docValidation.length > 0) {
            docValidation.forEach((c) => {
                message += Object.values(c.constraints).join("\n") + "\n";
            });
            return message;
        }
    } catch (err) {
        message += err.message;
        return message;
    }
}
