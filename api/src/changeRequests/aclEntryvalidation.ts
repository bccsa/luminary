import { GroupAclEntryDto } from "src/dto/GroupAclEntryDto";
import { GroupDto } from "src/dto/GroupDto";
import { AclPermission, DocType } from "src/enums";

// Define permissions per DocType
export const availablePermissionsPerDocType = {
    [DocType.Group]: [
        AclPermission.View,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Assign,
    ],
    [DocType.Language]: [
        AclPermission.View,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Assign,
        AclPermission.Translate,
    ],
    [DocType.Post]: [
        AclPermission.View,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Translate,
        AclPermission.Publish,
    ],
    [DocType.Tag]: [
        AclPermission.View,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Assign,
        AclPermission.Translate,
        AclPermission.Publish,
    ],
    [DocType.User]: [AclPermission.View, AclPermission.Edit, AclPermission.Delete],
};

// Valid DocTypes that can be used for ACL assignments
export const validDocTypes = Object.keys(availablePermissionsPerDocType) as DocType[];

// Check if a permission is available for a given DocType
export function isPermissionAvailable(docType: DocType, aclPermission: AclPermission): boolean {
    if (!validDocTypes.includes(docType)) return false;

    return availablePermissionsPerDocType[docType].includes(aclPermission);
}

// Check if the ACL entry permission has changed compared to the original group
export function hasChangedPermission(
    aclEntry: GroupAclEntryDto,
    permission: AclPermission,
    group: GroupDto,
): boolean {
    const origAclEntry = group.acl.find(
        (acl) => acl.groupId == aclEntry.groupId && acl.type == aclEntry.type,
    );

    if (!origAclEntry) return aclEntry.permission.includes(permission);

    return (
        origAclEntry.permission.includes(permission) !== aclEntry.permission.includes(permission)
    );
}

// Validate an ACL entry and return the validated entry
export function validateAclEntry(aclEntry: GroupAclEntryDto, prevAclEntry: GroupAclEntryDto): void {
    if (
        aclEntry.permission.length &&
        !aclEntry.permission.includes(AclPermission.View) &&
        prevAclEntry.permission.length === 0
    ) {
        aclEntry.permission.push(AclPermission.View);
    }

    if (!aclEntry.permission.includes(AclPermission.View)) {
        aclEntry.permission = [];
    }

    if (
        aclEntry.type == DocType.Group &&
        prevAclEntry.permission.includes(AclPermission.Assign) &&
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
export function compactAclEntries(aclEntries: GroupAclEntryDto[]): GroupAclEntryDto[] {
    return aclEntries.filter((a) => {
        a.permission = a.permission
            .filter((permission) => isPermissionAvailable(a.type, permission))
            .sort();

        return a.permission.length > 0 && validDocTypes.includes(a.type);
    });
}
