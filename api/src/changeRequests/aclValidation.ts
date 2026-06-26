import { GroupAclEntryDto } from "../dto/GroupAclEntryDto";
import { AclPermission, DocType } from "../enums";

// Define permissions per DocType.
// CmsView is assignable on every CMS-managed doc type: it gates CMS-scoped (cms:true)
// visibility/sync, including drafts and expired Content. The app uses plain View.
const availablePermissionsPerDocType = {
    [DocType.Group]: [
        AclPermission.View,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Assign,
        AclPermission.CmsView,
    ],
    [DocType.Language]: [
        AclPermission.View,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Assign,
        AclPermission.Translate,
        AclPermission.CmsView,
    ],
    [DocType.Post]: [
        AclPermission.View,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Translate,
        AclPermission.Publish,
        AclPermission.CmsView,
    ],
    [DocType.Tag]: [
        AclPermission.View,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Assign,
        AclPermission.Translate,
        AclPermission.Publish,
        AclPermission.CmsView,
    ],
    [DocType.User]: [
        AclPermission.View,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.CmsView,
    ],
    [DocType.Redirect]: [
        AclPermission.View,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.CmsView,
    ],
    [DocType.Storage]: [
        AclPermission.View,
        AclPermission.Edit,
        AclPermission.Assign,
        AclPermission.Delete,
        AclPermission.CmsView,
    ],
    [DocType.AuthProvider]: [
        AclPermission.View,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Assign,
        AclPermission.CmsView,
    ],
    [DocType.AutoGroupMappings]: [
        AclPermission.View,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Assign,
        AclPermission.CmsView,
    ],
};

// Valid DocTypes that can be used for ACL assignments
const validDocTypes = Object.keys(availablePermissionsPerDocType) as DocType[];

// Check if a permission is available for a given DocType
function isPermissionAvailable(docType: DocType, aclPermission: AclPermission): boolean {
    if (!validDocTypes.includes(docType)) return false;

    return availablePermissionsPerDocType[docType].includes(aclPermission);
}

// Validate an ACL entry and return the validated entry
function validateAclEntry(aclEntry: GroupAclEntryDto): void {
    if (aclEntry.permission.length && !aclEntry.permission.includes(AclPermission.View)) {
        aclEntry.permission.push(AclPermission.View);
    }

    if (!aclEntry.permission.includes(AclPermission.View)) {
        aclEntry.permission = [];
    }

    if (
        aclEntry.type == DocType.Group &&
        !aclEntry.permission.includes(AclPermission.Assign) &&
        aclEntry.permission.includes(AclPermission.Edit)
    ) {
        aclEntry.permission.splice(aclEntry.permission.indexOf(AclPermission.Edit), 1);
    }

    if (
        aclEntry.type == DocType.Group &&
        aclEntry.permission.includes(AclPermission.Edit) &&
        !aclEntry.permission.includes(AclPermission.Assign)
    ) {
        aclEntry.permission.push(AclPermission.Assign);
    }

    aclEntry.permission = aclEntry.permission.filter((permission) =>
        isPermissionAvailable(aclEntry.type, permission),
    );
}

// Remove ACL entries with no permissions and remove invalid permissions
function compactAclEntries(aclEntries: GroupAclEntryDto[]): GroupAclEntryDto[] {
    return aclEntries.filter((a) => {
        a.permission = a.permission
            .filter((permission) => isPermissionAvailable(a.type, permission))
            .sort();

        return a.permission.length > 0 && validDocTypes.includes(a.type);
    });
}

/**
 * Validates an ACL and returns the validated & compacted ACL. (This function removes invalid data from an ACL)
 */
export function validateAcl(acl: GroupAclEntryDto[]) {
    const _acl: GroupAclEntryDto[] = JSON.parse(JSON.stringify(acl));

    _acl.forEach((aclEntry) => validateAclEntry(aclEntry));
    return compactAclEntries(_acl);
}
