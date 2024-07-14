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

        // If the permission is not in the original ACL entry and the aclEntry does not have permissions set, it is not changed
        if (!origAclEntry && aclEntry.permission.length == 0) {
            return false;
        }

        // If the permission is in the original ACL entry and the permissions are the same, it is not changed
        if (origAclEntry && _.isEqual(origAclEntry.permission.sort(), aclEntry.permission.sort())) {
            return false;
        }

        // If the DocType is not in the original ACL, but is set in the new ACL, it is changed
        if (!origAclEntry && aclEntry.permission.includes(permission)) {
            return true;
        }

        if (
            origAclEntry &&
            origAclEntry.permission.includes(permission) != aclEntry.permission.includes(permission)
        )
            return true;

        return false;
    };
});

/**
 * Valid DocTypes that can be used ACL assignments
 */
export const validDocTypes = Object.keys(availablePermissionsPerDocType) as unknown as DocType[];
