import { ChangeReqDto } from "../dto/ChangeReqDto";
import { DbQueryResult, DbService } from "../db/db.service";
import { DocType, AclPermission, PublishStatus, Uuid } from "../enums";
import { LanguageDto } from "../dto/LanguageDto";
import { plainToInstance } from "class-transformer";
import { ValidationResult } from "./ValidationResult";
import { PermissionSystem } from "../permissions/permissions.service";
import { GroupAclEntryDto } from "../dto/GroupAclEntryDto";
import { ContentDto } from "../dto/ContentDto";
import { _baseDto } from "../dto/_baseDto";
import { _contentBaseDto } from "../dto/_contentBaseDto";
import { GroupDto } from "../dto/GroupDto";

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

    // Get the original document from the database for access verification of existing documents to prevent malicious changes to permissions / group membership
    let originalDoc: _baseDto;
    let isNewDoc = false;

    if (changeRequest.doc._id) {
        const res = await dbService.getDoc(changeRequest.doc._id);
        if (res.docs.length > 0) {
            originalDoc = res.docs[0];
        } else {
            originalDoc = doc;
            isNewDoc = true;
        }
    }

    // Reject document type changes
    if (doc.type !== originalDoc.type) {
        return {
            validated: false,
            error: "Document type change not allowed",
        };
    }

    // Reject non-user editable document types
    if (doc.type === DocType.Change) {
        return {
            validated: false,
            error: "Invalid document type - cannot submit Change documents",
        };
    }

    // Reject non-group documents that do not have a memberOf property
    if (
        doc.type !== DocType.Group &&
        doc.type !== DocType.Content &&
        doc.type !== DocType.Storage &&
        (!doc.memberOf || !Array.isArray(doc.memberOf) || doc.memberOf.length === 0)
    ) {
        return {
            validated: false,
            error: "The document is not a group or does not have group membership",
        };
    }

    // Validate delete request access
    if (
        doc.deleteReq &&
        !PermissionSystem.verifyAccess(
            doc.type == DocType.Group
                ? [originalDoc._id]
                : (originalDoc as _contentBaseDto).memberOf,
            (originalDoc as ContentDto).parentType || originalDoc.type,
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

    // Check if the user has translate access to all the associated content documents before deleting a post or tag. This is needed to delete the content documents.
    if (doc.deleteReq && (doc.type === DocType.Post || doc.type === DocType.Tag)) {
        const contentDocs = await dbService.getContentByParentId(doc._id);
        const contentLanguageIds = contentDocs.docs.map((d) => (d as ContentDto).language);
        const contentLanguages = await dbService.getDocs(contentLanguageIds, [DocType.Language]);

        for (const language of contentLanguages.docs) {
            const l = language as unknown as LanguageDto;
            if (
                !PermissionSystem.verifyAccess(
                    l.memberOf,
                    DocType.Language,
                    AclPermission.Translate,
                    groupMembership,
                    "any",
                )
            ) {
                return {
                    validated: false,
                    error: `Unable to delete ${doc.type}: No 'Translate' access to one or more associated content documents`,
                };
            }
        }
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
                    originalDoc.type,
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
            !PermissionSystem.verifyAccess(
                [doc._id],
                originalDoc.type,
                AclPermission.Edit,
                groupMembership,
            )
        ) {
            // This is an existing group, and the user should have edit permissions to the group
            return {
                validated: false,
                error: "No access to 'Edit' document type 'Group'",
            };
        }

        // Check existing and new assign access for groups in ACL list
        // ---------------------------------------------------
        if (
            !PermissionSystem.verifyAccess(
                [
                    ...new Set(
                        (originalDoc as GroupDto).acl.map(
                            (acl: GroupAclEntryDto) => acl.groupId,
                        ) as Uuid[],
                    ),
                ], // get unique values
                originalDoc.type,
                AclPermission.Assign,
                groupMembership,
                "all",
            ) ||
            !PermissionSystem.verifyAccess(
                [
                    ...new Set(
                        (doc as GroupDto).acl.map((acl: GroupAclEntryDto) => acl.groupId) as Uuid[],
                    ),
                ], // get unique values
                originalDoc.type,
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
    }

    if (doc.type === DocType.Content) {
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
    }

    if (
        doc.type !== DocType.Content &&
        doc.memberOf &&
        Array.isArray(doc.memberOf) &&
        doc.memberOf.length > 0
    ) {
        // Check if user has existing and new edit access to any other types of documents
        if (
            !PermissionSystem.verifyAccess(
                (originalDoc as _contentBaseDto).memberOf,
                originalDoc.type,
                AclPermission.Edit,
                groupMembership,
                "any",
            ) ||
            !PermissionSystem.verifyAccess(
                (doc as _contentBaseDto).memberOf,
                originalDoc.type,
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

        // Check if the user has assign access to all added groups in the memberOf property
        // TODO: Write tests for this
        if (
            !PermissionSystem.verifyAccess(
                isNewDoc
                    ? doc.memberOf // For new documents, check if the user has assign access to all groups in the memberOf property
                    : doc.memberOf.filter(
                          // For updated documents, check if the user has assign access to all new groups in the memberOf property
                          (g: Uuid) => !(originalDoc as _contentBaseDto).memberOf.includes(g),
                      ),
                DocType.Group,
                AclPermission.Assign,
                groupMembership,
                "all",
            )
        ) {
            return {
                validated: false,
                error: "No 'Assign' access to one or more groups",
            };
        }
    }

    if (doc.type == DocType.Language) {
        // Check if the existing document is a default language
        const prevDefault = (originalDoc as LanguageDto).default == 1;

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
    }

    // S3 Bucket and Storage document access control
    // =============================================
    if (doc.type === DocType.Storage) {
        // For S3 buckets and storage documents, we allow any authenticated user
        // These are infrastructure resources that should be manageable by admins
        // Since the user got this far, they are authenticated, so allow it

        return {
            validated: true,
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
