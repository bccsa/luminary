import { validateChangeRequest } from "./validateChangeRequest";
import { DbService, DbUpsertResult } from "../db/db.service";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { DocType, Uuid } from "../enums";
import { S3Service } from "../s3/s3.service";
import { PostDto } from "../dto/PostDto";
import { TagDto } from "../dto/TagDto";
import { ContentDto } from "../dto/ContentDto";
import { LanguageDto } from "../dto/LanguageDto";
import { isEqualDoc } from "../util/isEqualDoc";
import { _baseDto } from "src/dto/_baseDto";
import processPostTagDto from "./documentProcessing/processPostTagDto";
import processContentDto from "./documentProcessing/processContentDto";
import processLanguageDto from "./documentProcessing/processLanguageDto";

export async function processChangeRequest(
    userId: string,
    changeRequest: ChangeReqDto,
    groupMembership: Array<Uuid>,
    db: DbService,
    s3: S3Service,
): Promise<{ result: DbUpsertResult; warnings?: string[] }> {
    // Validate change request
    const validationResult = await validateChangeRequest(changeRequest, groupMembership, db);

    if (!validationResult.validated) {
        throw new Error(validationResult.error);
    }

    const doc = validationResult.validatedData;
    const prevDocQuery = await db.getDoc(doc._id);
    const prevDoc: _baseDto | undefined = prevDocQuery.docs?.length
        ? prevDocQuery.docs[0]
        : undefined;

    // Check if the document has changed
    if (isEqualDoc(doc, prevDoc)) {
        return {
            result: {
                ok: true,
                message: "Document is identical to the one in the database",
            } as DbUpsertResult,
        };
    }

    // insert user id into the change request document, so that we can keep a record of who made the change
    doc.updatedBy = userId;

    const docProcessMap = {
        [DocType.Post]: () => processPostTagDto(doc as PostDto, prevDoc as PostDto, db, s3),
        [DocType.Tag]: () => processPostTagDto(doc as TagDto, prevDoc as TagDto, db, s3),
        [DocType.Content]: () => processContentDto(doc as ContentDto, db),
        [DocType.Language]: () => processLanguageDto(doc as LanguageDto, db),
    };

    if (docProcessMap[doc.type]) {
        const processingResult = await docProcessMap[doc.type]();
        if (Array.isArray(processingResult)) {
            validationResult.warnings.push(...processingResult);
        }
    }

    // Insert / update the document in the database
    const upsertResult = await db.upsertDoc(doc);

    const res: { result: DbUpsertResult; warnings?: string[] } = {
        result: upsertResult,
    };

    if (validationResult.warnings && validationResult.warnings.length > 0) {
        res.warnings = validationResult.warnings;
    }

    return res;
}
