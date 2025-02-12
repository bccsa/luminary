import { ChangeReqDto } from "../dto/ChangeReqDto";
import { DbQueryResult, DbService } from "../db/db.service";
import { DocType, AclPermission, PublishStatus, Uuid } from "../enums";
import { LanguageDto } from "../dto/LanguageDto";
import { plainToInstance } from "class-transformer";
import { ValidationResult } from "./ValidationResult";
import { PermissionSystem } from "../permissions/permissions.service";
import { GroupAclEntryDto } from "../dto/GroupAclEntryDto";

/**
 * Validate a change request against a user's access map
 * @param changeRequest Change Request document
 * @param groupMembership Array of group IDs to which the user is a member of
 * @param dbService Database connection instance
 */
export async function validateChangeRequestAccess(
    changeRequest: ChangeReqDto,
    groupMembership: Array<Uuid>,
    dbService: DbService,
): Promise<ValidationResult> {
    // To save changes to a document / create a new document, a user needs to have the required permission
    // (e.g. edit, translate, assign) to all of the groups of which the document is a member of.

    const doc = changeRequest.doc;
    // Reject non-user editable document types
    if (doc.type === DocType.Change) {
        return {
            validated: false,
            error: "Invalid document type - cannot submit Change documents",
        };
    }

    // Validate delete request access
    if (
        doc.deleteReq &&
        !PermissionSystem.verifyAccess(
            doc.type == DocType.Group ? [doc._id] : doc.memberOf,
            doc.type,
            AclPermission.Delete,
            groupMembership,
            "all",
        )
    ) {
        return {
            validated: false,
            error: "No 'Delete' access to document",
        };
    }

    // Validate edit, translate and group ACL assign access
    // ====================================================

    if (doc.type === DocType.Group) {
        // Check group edit access
        // -----------------------
        if (!PermissionSystem.hasGroup(doc._id)) {
            // If this is a new group, the permission system does not yet know about it and it will not be in the access map.
            // We need to check if the user has edit access to at least one of the groups in the ACL list, which will imply that
            // the user has edit access to the new group through inheritance, or that at least one ACL entry gives edit access
            // to the new group.
            if (
                !PermissionSystem.verifyAccess(
                    [...new Set(doc.acl.map((acl: GroupAclEntryDto) => acl.groupId) as Uuid[])], // get unique values
                    doc.type,
                    AclPermission.Edit,
                    groupMembership,
                    "any",
                ) &&
                !doc.acl.some(
                    (acl: GroupAclEntryDto) =>
                        acl.type == DocType.Group && acl.permission.includes(AclPermission.Edit),
                )
            ) {
                return {
                    validated: false,
                    error: "No access to create a new document type 'Group'",
                };
            }
        } else if (
            !PermissionSystem.verifyAccess([doc._id], doc.type, AclPermission.Edit, groupMembership)
        ) {
            // This is an existing group, and the user should have edit permissions to the group
            return {
                validated: false,
                error: "No access to 'Edit' document type 'Group'",
            };
        }

        // Check assign access for groups in ACL list
        // ------------------------------------------
        if (
            !PermissionSystem.verifyAccess(
                [...new Set(doc.acl.map((acl: GroupAclEntryDto) => acl.groupId) as Uuid[])], // get unique values
                doc.type,
                AclPermission.Assign,
                groupMembership,
                "all",
            )
        ) {
            return {
                validated: false,
                error: "No access to 'Assign' one or more groups to the group ACL",
            };
        }
    } else if (doc.type === DocType.Content) {
        // Check language/translate and publish access for Content documents
        // -----------------------------------------------------------------

        // Get the parent document (post / tag) from the database
        const getRequest = await dbService.getDoc(doc.parentId);
        if (getRequest.docs.length === 0) {
            return {
                validated: false,
                error: "Parent document not found",
            };
        }
        const parentDoc = getRequest.docs[0];

        // Set the parent document type on the Content document
        doc.parentType = parentDoc.type;

        // Check if the user has translate access to the Content document's parent document (post / tag)
        // Note: Content documents are always saved with the same group membership as their parent (post / tag) document
        if (
            !PermissionSystem.verifyAccess(
                parentDoc.memberOf,
                parentDoc.type,
                AclPermission.Translate,
                groupMembership,
                "any",
            )
        ) {
            return {
                validated: false,
                error: "No access to 'Translate' document",
            };
        }

        // Check if the user has access to the language of the Content document
        const dbLangDoc = await dbService.getDocs([doc.language], [DocType.Language]);
        if (dbLangDoc.docs.length == 0) {
            return {
                validated: false,
                error: "Language document not found",
            };
        }
        const language = plainToInstance(LanguageDto, dbLangDoc.docs[0]);

        if (
            !PermissionSystem.verifyAccess(
                language.memberOf,
                DocType.Language,
                AclPermission.Translate,
                groupMembership,
                "any",
            )
        ) {
            return {
                validated: false,
                error: "No 'Translate' access to the language of the Content object",
            };
        }

        // Check if the user has access to set the publishStatus to Published
        if (doc.status === PublishStatus.Published) {
            if (
                !PermissionSystem.verifyAccess(
                    parentDoc.memberOf,
                    parentDoc.type,
                    AclPermission.Publish,
                    groupMembership,
                    "any",
                )
            ) {
                return {
                    validated: false,
                    error: "No 'Publish' access to document type 'Content'",
                };
            }
        }
    } else if (doc.type == DocType.Language) {
        if (
            !PermissionSystem.verifyAccess(
                doc.memberOf,
                doc.type,
                AclPermission.Edit,
                groupMembership,
                "any",
            )
        ) {
            return {
                validated: false,
                error: "No 'Edit' access to document",
            };
        }

        // Get the previous document to check if the default flag has been changed
        const getRequest = await dbService.getDoc(doc._id);
        const prevDefault =
            getRequest.docs.length && (getRequest.docs[0] as LanguageDto).default == 1;

        if (doc.default === 1 && !prevDefault) {
            const languageDocs = await dbService.getDocsByType(DocType.Language);
            const languageGroups = languageDocs.docs.map((d) => d.memberOf).flat();

            // Check if the user has edit access to all language documents to be able to change the default language
            if (
                !PermissionSystem.verifyAccess(
                    languageGroups,
                    doc.type,
                    AclPermission.Edit,
                    groupMembership,
                    "all",
                )
            ) {
                return {
                    validated: false,
                    error: "Edit access to all languages is required to change the default language",
                };
            }
        }
    } else if (doc.memberOf && Array.isArray(doc.memberOf) && doc.memberOf.length > 0) {
        // Check if user has edit access to any other types of documents
        // -------------------------------------------------------------
        if (
            !PermissionSystem.verifyAccess(
                doc.memberOf,
                doc.type,
                AclPermission.Edit,
                groupMembership,
                "any",
            )
        ) {
            return {
                validated: false,
                error: "No 'Edit' access to document",
            };
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
        const tagDocs: DbQueryResult = await dbService.getDocs(doc.tags, [DocType.Tag]);

        // Compare tag group membership with groups to which the user has assign access to
        if (tagDocs.docs && Array.isArray(tagDocs.docs)) {
            for (const d of tagDocs.docs) {
                const tagDoc = d as any;
                if (tagDoc.memberOf && Array.isArray(tagDoc.memberOf)) {
                    if (
                        !PermissionSystem.verifyAccess(
                            tagDoc.memberOf,
                            DocType.Tag,
                            AclPermission.Assign,
                            groupMembership,
                            "all",
                        )
                    ) {
                        return {
                            validated: false,
                            error: "No 'Assign' access to one or more tags",
                        };
                    }
                }
            }
        }
    }

    return {
        validated: true,
        validatedData: doc,
    };
}
