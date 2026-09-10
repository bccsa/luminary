import { AclPermission, DocType, type GroupAclEntryDto, type GroupDto } from "luminary-shared";
import { computed, toRaw } from "vue";

// CmsView is assignable on every CMS-managed doc type: it gates CMS-scoped (cms:true)
// visibility/sync, including drafts and expired Content. Mirrors api/src/changeRequests/aclValidation.ts.
export const availablePermissionsPerDocType = {
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
        AclPermission.Share,
        AclPermission.CmsView,
    ],
    [DocType.Tag]: [
        AclPermission.View,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Assign,
        AclPermission.Translate,
        AclPermission.Publish,
        AclPermission.Share,
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
 * Permission implied when an ACL entry is granted anything. App-facing View is never implied — it is
 * assigned deliberately, so a CMS permission change can't grant app visibility by accident.
 */
export const impliedAclPermission = AclPermission.CmsView;

/**
 * Permissions only the CMS acts on. None can be exercised without CmsView, so granting one implies
 * it. Mirrors api/src/changeRequests/aclValidation.ts.
 */
export const cmsOnlyPermissions = [
    AclPermission.Edit,
    AclPermission.Delete,
    AclPermission.Assign,
    AclPermission.Translate,
    AclPermission.Publish,
];

/**
 * Check if an ACL entry carries either of the visibility permissions the other permissions depend on
 */
const hasVisibilityPermission = (aclEntry: GroupAclEntryDto) =>
    aclEntry.permission.includes(AclPermission.View) ||
    aclEntry.permission.includes(AclPermission.CmsView);

/**
 * Switch an ACL entry on or off
 */
export const toggleAclEntry = (aclEntry: GroupAclEntryDto) => {
    aclEntry.permission = aclEntry.permission.length ? [] : [impliedAclPermission];
};

/**
 * Validate an ACL entry and returns the validated entry
 */
export const validateAclEntry = (aclEntry: GroupAclEntryDto, prevAclEntry: GroupAclEntryDto) => {
    // Add visibility if any other permission is set
    if (
        aclEntry.permission.length &&
        !hasVisibilityPermission(aclEntry) &&
        prevAclEntry.permission.length === 0
    ) {
        aclEntry.permission.push(impliedAclPermission);
    }

    // A CMS-only permission alongside View implies CmsView. The server applies this too, so leaving
    // it out here would show the editor a state that reverts on the next sync.
    if (
        aclEntry.permission.some((p) => cmsOnlyPermissions.includes(p)) &&
        !aclEntry.permission.includes(AclPermission.CmsView) &&
        aclEntry.permission.includes(AclPermission.View)
    ) {
        aclEntry.permission.push(AclPermission.CmsView);
    }

    // No other permission can be exercised without one of the visibility permissions
    if (!hasVisibilityPermission(aclEntry)) {
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
        aclEntry.permission.push(AclPermission.Assign);
    }

    // Remove invalid permissions
    aclEntry.permission = aclEntry.permission.filter((permission) =>
        isPermissionAvailable.value(aclEntry.type, permission),
    );
};

/**
 * Remove ACL entries with no permissions and remove invalid permissions
 */
export const compactAclEntries = (aclEntries: GroupAclEntryDto[]) => {
    return toRaw(aclEntries).filter((a) => {
        // Remove invalid permissions
        a.permission = a.permission
            .filter((permission) => isPermissionAvailable.value(a.type, permission))
            .sort(); // Sort the permissions list to help prevent dirty checking issues.

        return a.permission.length > 0 && validDocTypes.includes(a.type);
    });
};
