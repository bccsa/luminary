import { AclPermission, DocType, type GroupAclEntryDto, type GroupDto } from "luminary-shared";
import { computed } from "vue";
import * as _ from "lodash";

export const availablePermissionsPerDocType = {
    [DocType.Group]: [
        AclPermission.View,
        AclPermission.Create,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Assign,
    ],
    [DocType.Language]: [
        AclPermission.View,
        AclPermission.Create,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Assign,
        AclPermission.Translate,
    ],
    [DocType.Post]: [
        AclPermission.View,
        AclPermission.Create,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Translate,
        AclPermission.Publish,
    ],
    [DocType.Tag]: [
        AclPermission.View,
        AclPermission.Create,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Assign,
        AclPermission.Translate,
        AclPermission.Publish,
    ],
    [DocType.User]: [AclPermission.View, AclPermission.Edit, AclPermission.Delete],
};

/**
 * Check if a permission is available for a given DocType
 */
export const isPermissionAvailable = computed(() => {
    return (docType: DocType, aclPermission: AclPermission) => {
        if (!validDocTypes.includes(docType)) return false;

        // @ts-expect-error Not all DocTypes are in the array but we only call it with ones that are
        return availablePermissionsPerDocType[docType].includes(aclPermission);
    };
});

/**
 * Check if the acl entry permission has changed compared to the original group.
 */
export const hasChangedPermission = computed(() => {
    return (aclEntry: GroupAclEntryDto, permission: AclPermission, group: GroupDto) => {
        const origAclEntry = group.acl.find(
            (acl) => acl.groupId == aclEntry.groupId && acl.type == aclEntry.type,
        );

        if (!origAclEntry) return aclEntry.permission.includes(permission);

        return (
            origAclEntry.permission.includes(permission) != aclEntry.permission.includes(permission)
        );
    };
});

/**
 * Valid DocTypes that can be used ACL assignments
 */
export const validDocTypes = Object.keys(availablePermissionsPerDocType) as unknown as DocType[];

/**
 * Validate an ACL entry and returns the validated entry
 */
export const validateAclEntry = (aclEntry: GroupAclEntryDto, prevAclEntry: GroupAclEntryDto) => {
    // Add the view permission if any other permission is set
    if (
        aclEntry.permission.length &&
        !aclEntry.permission.includes(AclPermission.View) &&
        prevAclEntry.permission.length === 0
    ) {
        aclEntry.permission.push(AclPermission.View);
    }

    // Remove all other permissions if the view permission is removed
    if (!aclEntry.permission.includes(AclPermission.View)) {
        aclEntry.permission = [];
    }
};
