import type { AccessMap } from "luminary-shared";
import { AclPermission, DocType } from "luminary-shared";

const SUPER_ADMIN_GROUP = "group-super-admins";

const fullDocPermissions: Record<string, Record<string, boolean>> = {
    [DocType.Post]: {
        [AclPermission.View]: true,
        [AclPermission.Edit]: true,
        [AclPermission.Delete]: true,
        [AclPermission.Translate]: true,
        [AclPermission.Publish]: true,
    },
    [DocType.Tag]: {
        [AclPermission.View]: true,
        [AclPermission.Edit]: true,
        [AclPermission.Delete]: true,
        [AclPermission.Assign]: true,
        [AclPermission.Translate]: true,
        [AclPermission.Publish]: true,
    },
    [DocType.Group]: {
        [AclPermission.View]: true,
        [AclPermission.Edit]: true,
        [AclPermission.Delete]: true,
        [AclPermission.Assign]: true,
    },
    [DocType.User]: {
        [AclPermission.View]: true,
        [AclPermission.Edit]: true,
        [AclPermission.Delete]: true,
    },
    [DocType.Language]: {
        [AclPermission.View]: true,
        [AclPermission.Edit]: true,
        [AclPermission.Delete]: true,
        [AclPermission.Assign]: true,
        [AclPermission.Translate]: true,
    },
    [DocType.Redirect]: {
        [AclPermission.View]: true,
        [AclPermission.Edit]: true,
        [AclPermission.Delete]: true,
        [AclPermission.Assign]: true,
        [AclPermission.Translate]: true,
        [AclPermission.Publish]: true,
    },
    [DocType.Storage]: {
        [AclPermission.View]: true,
        [AclPermission.Edit]: true,
        [AclPermission.Delete]: true,
        [AclPermission.Assign]: true,
    },
};

/**
 * Full super-admin-style access map for E2E tests. E2E test user gets access to everything.
 */
export const E2E_ACCESS_MAP: AccessMap = {
    [SUPER_ADMIN_GROUP]: fullDocPermissions as AccessMap[string],
};
