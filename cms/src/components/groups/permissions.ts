import { AclPermission, DocType, type GroupAclEntryDto, type GroupDto } from "luminary-shared";
import { computed } from "vue";

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
    [DocType.User]: [
        AclPermission.View,
        AclPermission.Create,
        AclPermission.Edit,
        AclPermission.Delete,
    ],
};

/**
 * Valid DocTypes that can be used ACL assignments
 */
export const validDocTypes = Object.keys(availablePermissionsPerDocType) as unknown as DocType[];

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
 * Validate an ACL entry and returns the validated entry
 */
export const validateAclEntry = (aclEntry: GroupAclEntryDto, prevAclEntry: GroupAclEntryDto) => {
    // Add the view permission if any other permission is set
    if (
        aclEntry.permission.length &&
        !aclEntry.permission.includes(AclPermission.View) &&
        prevAclEntry.permission.length === 0
    ) {
        aclEntry.permission = [AclPermission.View, ...aclEntry.permission]; // We need to recreate the array to trigger reactivity
    }

    // Remove all other permissions if the view permission is removed
    if (!aclEntry.permission.includes(AclPermission.View)) {
        aclEntry.permission = [];
    }

    // Remove edit permission if assign permission is removed on groups
    if (
        aclEntry.type == DocType.Group &&
        prevAclEntry.permission.includes(AclPermission.Assign) &&
        !aclEntry.permission.includes(AclPermission.Assign) &&
        aclEntry.permission.includes(AclPermission.Edit)
    ) {
        aclEntry.permission.splice(aclEntry.permission.indexOf(AclPermission.Edit), 1);
    }

    // Add assign permission if edit permission is set on groups
    if (
        aclEntry.type == DocType.Group &&
        aclEntry.permission.includes(AclPermission.Edit) &&
        !aclEntry.permission.includes(AclPermission.Assign)
    ) {
        aclEntry.permission = [...aclEntry.permission, AclPermission.Assign]; // We need to recreate the array to trigger reactivity
    }

    // Sort the permissions list to help prevent dirty checking issues. If the permissions list was stored unsorted in the database
    // the dirty check will still show a change even though the permissions are the same, but after saving it will work correctly.
    aclEntry.permission.sort();
};
