import { validateChangeRequest } from "./validateChangeRequest";
import { DbService, DbUpsertResult } from "../db/db.service";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { DocType, PublishStatus, Uuid } from "../enums";
import { PostDto } from "../dto/PostDto";
import { TagDto } from "../dto/TagDto";
import { ContentDto } from "../dto/ContentDto";
import { LanguageDto } from "../dto/LanguageDto";
import { StorageDto } from "../dto/StorageDto";
import { isEqualDoc } from "../util/isEqualDoc";
import { _baseDto } from "src/dto/_baseDto";
import processPostTagDto from "./documentProcessing/processPostTagDto";
import processContentDto from "./documentProcessing/processContentDto";
import processLanguageDto from "./documentProcessing/processLanguageDto";
import processGroupDto from "./documentProcessing/processGroupDto";
import { GroupDto } from "../dto/GroupDto";
import processStorageDto from "./documentProcessing/processStorageDto";
import processAuthProviderDto from "./documentProcessing/processAuthProviderDto";
import { AuthProviderDto } from "../dto/AuthProviderDto";
import processUserDto from "./documentProcessing/processUserDto";
import { UserDto } from "../dto/UserDto";
import processRedirectDto from "./documentProcessing/processRedirectDto";
import { RedirectDto } from "../dto/RedirectDto";
import { createSlugChangeRedirect, findSlugReversionRedirect } from "./createSlugChangeRedirect";
import processUserAffinityDto from "./documentProcessing/processUserAffinityDto";
import { UserAffinityDto } from "../dto/UserAffinityDto";
import processDefaultAffinityDto from "./documentProcessing/processDefaultAffinityDto";
import { DefaultAffinityDto } from "../dto/DefaultAffinityDto";

type ProcessChangeRequestResult = {
    result: DbUpsertResult;
    warnings?: string[];
    info?: string[];
};

export async function processChangeRequest(
    userId: string,
    changeRequest: ChangeReqDto,
    groupMembership: Array<Uuid>,
    db: DbService,
): Promise<ProcessChangeRequestResult> {
    // Validate change request
    const validationResult = await validateChangeRequest(
        changeRequest,
        groupMembership,
        db,
        userId,
    );

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

    const slugReversionRedirect =
        doc.type === DocType.Content
            ? await findSlugReversionRedirect(
                  doc as ContentDto,
                  prevDoc as ContentDto | undefined,
                  groupMembership,
                  db,
              )
            : undefined;

    const docProcessMap = {
        [DocType.Post]: () => processPostTagDto(doc as PostDto, prevDoc as PostDto, db),
        [DocType.Tag]: () => processPostTagDto(doc as TagDto, prevDoc as TagDto, db),
        [DocType.Content]: () =>
            processContentDto(doc as ContentDto, db, slugReversionRedirect?._id),
        [DocType.Language]: () => processLanguageDto(doc as LanguageDto, db),
        [DocType.Group]: () => processGroupDto(doc as GroupDto),
        [DocType.Storage]: () => processStorageDto(doc as StorageDto, prevDoc as StorageDto, db),
        [DocType.AuthProvider]: () =>
            processAuthProviderDto(doc as AuthProviderDto, prevDoc as AuthProviderDto, db),
        [DocType.User]: () => processUserDto(doc as UserDto),
        [DocType.Redirect]: () => processRedirectDto(doc as RedirectDto),
        [DocType.UserAffinity]: () => processUserAffinityDto(doc as UserAffinityDto, userId),
        [DocType.DefaultAffinity]: () => processDefaultAffinityDto(doc as DefaultAffinityDto),
        [DocType.AutoGroupMappings]: () => {}, // No extra processing required, but needed to be part of the process map for access validation,
    };

    if (docProcessMap[doc.type]) {
        const processingWarnings = await docProcessMap[doc.type]();
        if (Array.isArray(processingWarnings)) {
            if (!validationResult.warnings) validationResult.warnings = [];
            validationResult.warnings.push(...processingWarnings);
        }
    }

    // Insert / update the document in the database
    const upsertResult = await db.upsertDoc(doc);

    const res: ProcessChangeRequestResult = {
        result: upsertResult,
    };

    if (
        slugReversionRedirect &&
        upsertResult.ok &&
        (doc as ContentDto).status === PublishStatus.Published
    ) {
        try {
            const redirectDeleteResult = await db.upsertDoc({
                ...slugReversionRedirect,
                updatedBy: userId,
                deleteReq: 1,
            });
            if (!redirectDeleteResult.ok) {
                throw new Error("Could not remove the superseded slug redirect");
            }
            res.info = [
                `Removed redirect from "${slugReversionRedirect.slug}" to "${slugReversionRedirect.toSlug}"`,
            ];
        } catch (error) {
            // Do not leave the published Content/Redirect slug invariant broken if redirect
            // cleanup fails after the content write. Restore the previous content revision.
            if (prevDoc) await db.upsertDoc(prevDoc);
            throw error;
        }
    }

    if (doc.type === DocType.Content && upsertResult.ok && !slugReversionRedirect) {
        const redirectResult = await createSlugChangeRedirect(
            userId,
            doc as ContentDto,
            prevDoc as ContentDto | undefined,
            groupMembership,
            db,
        );
        if (redirectResult?.warning) {
            if (!validationResult.warnings) validationResult.warnings = [];
            validationResult.warnings.push(redirectResult.warning);
        }
        if (redirectResult?.info) {
            res.info = [redirectResult.info];
        }
    }

    if (validationResult.warnings && validationResult.warnings.length > 0) {
        res.warnings = validationResult.warnings;
    }

    return res;
}
