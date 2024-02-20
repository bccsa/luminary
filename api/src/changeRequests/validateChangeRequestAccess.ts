import { ChangeReqDto, ChangeReqItemDto } from "../dto/ChangeReqDto";
import { AccessMap } from "../permissions/AccessMap";
import { DbService } from "../db/db.service";
import { DocType, AclPermission, PublishStatus } from "../enums";
import { LanguageDto } from "../dto/LanguageDto";
import { plainToInstance } from "class-transformer";
import { MangoResponse } from "nano";
import { ValidationResult } from "./ValidationResult";

export async function validateChangeRequestAccess(
    changeReq: ChangeReqDto,
    accessMap: AccessMap,
    dbService: DbService,
) {
    for (const change of changeReq.changes) {
        const validationResult = await validateItemAccess(change, accessMap, dbService);

        if (!validationResult.validated) {
            return validationResult;
        }
    }

    return {
        validated: true,
    };
}

/**
 * Validate a change request against a user's access map
 * @param change Change Request document
 * @param accessMap Access map to validate change request against
 * @param dbService Database connection instance
 */
async function validateItemAccess(
    change: ChangeReqItemDto,
    accessMap: AccessMap,
    dbService: DbService,
): Promise<ValidationResult> {
    // To save changes to a document / create a new document, a user needs to have the required permission
    // (e.g. edit, translate, assign) to all of the groups of which the document is a member of.

    const doc = change.doc;
    // Reject non-user editable document types
    if (
        doc.type === DocType.Change ||
        doc.type === DocType.ChangeReq ||
        doc.type === DocType.ChangeReqAck
    ) {
        return {
            validated: false,
            error: "Invalid document type - cannot submit Change, ChangeReq or ChangeReqAck documents",
        };
    }

    // Validate edit, translate and group ACL assign access
    // ====================================================

    if (doc.type === DocType.Group) {
        // Check group edit access
        // -----------------------
        const editGroups = accessMap.calculateAccess([DocType.Group], AclPermission.Edit);
        if (!editGroups.includes(doc._id)) {
            return {
                validated: false,
                error: "No access to 'Edit' document type 'Group'",
            };
        }

        // Check assign access for groups in ACL list
        // ------------------------------------------
        const assignGroups = accessMap.calculateAccess([DocType.Group], AclPermission.Assign);
        for (const aclEntry of doc.acl) {
            // Check if the user has assign access to the ACL entry's group
            if (!assignGroups.includes(aclEntry.groupId)) {
                return {
                    validated: false,
                    error: "No access to 'Assign' one or more groups to the group ACL",
                };
            }
        }
    } else if (doc.type === DocType.Content) {
        // Check language/translate and publish access for Content documents
        // -----------------------------------------------------------------

        // Get the parent document (post / tag) from the database
        const parentDoc = await dbService.getParentDoc(doc._id);
        if (!parentDoc) {
            return {
                validated: false,
                error: "Parent document not found",
            };
        }

        // Check if the user has translate access to the Content document's parent document (post / tag)
        // Note: Content documents are always saved with the same group membership as their parent (post / tag) document
        const translateGroups = accessMap.calculateAccess(
            [parentDoc.type],
            AclPermission.Translate,
        );

        for (const groupId of parentDoc.memberOf) {
            if (!translateGroups.includes(groupId)) {
                return {
                    validated: false,
                    error: "No access to 'Translate' document",
                };
            }
        }

        // Check if the user has access to the language of the Content document
        const dbLangDoc = await dbService.getDocs([doc.language], [DocType.Language]);
        if (dbLangDoc.length > 0) {
            const language = plainToInstance(LanguageDto, dbLangDoc[0]);

            // Get groups to which the user has Translate access to for Language documents
            const userLanguageGroups = accessMap.calculateAccess(
                [DocType.Language],
                AclPermission.Translate,
            );

            for (const groupId of language.memberOf) {
                if (!userLanguageGroups.includes(groupId)) {
                    return {
                        validated: false,
                        error: "No 'Translate' access to the language of the Content object",
                    };
                }
            }
        }

        // Check if the user has access to set the publishStatus to Published
        if (doc.status === PublishStatus.Published) {
            const publishGroups = accessMap.calculateAccess(
                [parentDoc.type],
                AclPermission.Publish,
            );
            for (const groupId of parentDoc.memberOf) {
                if (!publishGroups.includes(groupId)) {
                    return {
                        validated: false,
                        error: "No 'Publish' access to document type 'Content'",
                    };
                }
            }
        }
    } else if (doc.memberOf && Array.isArray(doc.memberOf) && doc.memberOf.length > 0) {
        // Check if user has edit access to any other types of documents
        // -------------------------------------------------------------
        const editGroups = accessMap.calculateAccess([doc.type], AclPermission.Edit);
        for (const groupId of doc.memberOf) {
            if (!editGroups.includes(groupId)) {
                return {
                    validated: false,
                    error: "No 'Edit' access to one or more groups",
                };
            }
        }
    } else {
        return {
            validated: false,
            error: "Unable to verify access. The document is not a group or does not have group membership",
        };
    }

    // Validate tag assign access
    // ============================
    if (doc.tags && doc.tags.length > 0) {
        // Get tag documents from database
        const tagDocs: MangoResponse<unknown> = await dbService.getDocs(doc.tags, [DocType.Tag]);

        // Get array of groups to which the user has Assign access
        const assignGroups = accessMap.calculateAccess([DocType.Tag], AclPermission.Assign);

        // Compare tag group membership with groups to which the user has assign access to
        if (tagDocs && Array.isArray(tagDocs)) {
            for (const d of tagDocs) {
                const tagDoc = d as any;
                if (tagDoc.memberOf && Array.isArray(tagDoc.memberOf)) {
                    for (const groupId of tagDoc.memberOf) {
                        if (!assignGroups.includes(groupId)) {
                            return {
                                validated: false,
                                error: "No 'Assign' access to one or more tags",
                            };
                        }
                    }
                }
            }
        }
    }

    return {
        validated: true,
    };
}
