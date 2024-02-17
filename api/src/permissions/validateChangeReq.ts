import { ChangeReqDto } from "../dto/ChangeReqDto";
import { AccessMap } from "./AccessMap";
import { DbService } from "../db/db.service";
import { DocType, AclPermission, PublishStatus } from "../enums";
import { LanguageDto } from "../dto/LanguageDto";
import { plainToInstance } from "class-transformer";
import { MangoResponse } from "nano";

/**
 * Validate a change request against a user's access map
 * @param changeReq Change Request document
 * @param accessMap Access map to validate change request against
 * @param dbService Database connection instance
 */
export async function validateChangeRequest(
    changeReq: ChangeReqDto,
    accessMap: AccessMap,
    dbService: DbService,
) {
    // To save changes to a document / create a new document, a user needs to have the required permission
    // (e.g. edit, translate, assign) to all of the groups of which the document is a member of.

    const doc = changeReq.doc;
    // Validate edit, translate and group ACL assign access
    // ====================================================

    if (doc.type === DocType.Group) {
        // Check group edit access
        // -----------------------
        const editGroups = accessMap.calculateAccess([DocType.Group], AclPermission.Edit);
        if (!editGroups.includes(doc._id)) {
            return "No access to 'Edit' document type 'Group'";
        }

        // Check assign access for groups in ACL list
        // ------------------------------------------
        const assignGroups = accessMap.calculateAccess([DocType.Group], AclPermission.Assign);
        for (const aclEntry of doc.acl) {
            // Check if the user has assign access to the ACL entry's group
            if (!assignGroups.includes(aclEntry.groupId)) {
                return "No access to 'Assign' one or more groups to the group ACL";
            }
        }
    } else if (doc.type === DocType.Content) {
        // Check language/translate and publish access for Content documents
        // -----------------------------------------------------------------

        // Get the parent document (post / tag) from the database
        const parentDoc = await dbService.getParentDoc(doc._id);
        if (!parentDoc) {
            return "Parent document not found";
        }

        // Check if the user has translate access to the Content document's parent document (post / tag)
        // Note: Content documents are always saved with the same group membership as their parent (post / tag) document
        const translateGroups = accessMap.calculateAccess(
            [parentDoc.type],
            AclPermission.Translate,
        );

        for (const groupId of parentDoc.memberOf) {
            if (!translateGroups.includes(groupId)) {
                return "No access to 'Translate' document";
            }
        }

        // Check if the user has access to the language of the Content document
        const dbLangDoc = await dbService.getDocs([doc.language], [DocType.Language]);
        if (dbLangDoc.docs.length > 0) {
            const language = plainToInstance(LanguageDto, dbLangDoc.docs[0]);

            // Get groups to which the user has Translate access to for Language documents
            const userLanguageGroups = accessMap.calculateAccess(
                [DocType.Language],
                AclPermission.Translate,
            );

            for (const groupId of language.memberOf) {
                if (!userLanguageGroups.includes(groupId)) {
                    return "No 'Translate' access to the language of the Content object";
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
                    return "No 'Publish' access to document type 'Content'";
                }
            }
        }
    } else if (doc.memberOf && Array.isArray(doc.memberOf) && doc.memberOf.length > 0) {
        // Check if user has edit access to any other types of documents
        // -------------------------------------------------------------
        const editGroups = accessMap.calculateAccess([doc.type], AclPermission.Edit);
        for (const groupId of doc.memberOf) {
            if (!editGroups.includes(groupId)) {
                return "No 'Edit' access to one or more groups";
            }
        }
    } else {
        return "Unable to verify access. The document is not a group or does not have group membership";
    }

    // Validate tag assign access
    // ============================
    if (doc.tags) {
        // Get tag documents from database
        const tagDocs: MangoResponse<unknown> = await dbService.getDocs(doc.tags, [DocType.Tag]);

        // Get array of groups to which the user has Assign access
        const assignGroups = accessMap.calculateAccess([DocType.Tag], AclPermission.Assign);

        // Compare tag group membership with groups to which the user has assign access to
        if (tagDocs.docs && Array.isArray(tagDocs.docs)) {
            for (const d of tagDocs.docs) {
                const tagDoc = d as any;
                if (tagDoc.memberOf && Array.isArray(tagDoc.memberOf)) {
                    for (const groupId of tagDoc.memberOf) {
                        if (!assignGroups.includes(groupId)) {
                            return "No 'Assign' access to one or more tags";
                        }
                    }
                }
            }
        }
    }

    return ""; // Empty response means the vaildation passed (i.e. no error)
}
