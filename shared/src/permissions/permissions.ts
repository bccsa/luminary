import { Ref } from "vue";
import { DocType, Uuid, AclPermission } from "../types";
import { useLocalStorage } from "@vueuse/core";

export type AccessMap = {
    [T: Uuid]: { [U in DocType]?: { [V in AclPermission]?: boolean | undefined } };
};

/**
 * Access map for the current user as a Vue ref
 */
export const accessMap: Ref<AccessMap> = useLocalStorage("accessMap", {});

/**
 * Verify if the user has access to a group for the specified document type and permission.
 */
export const verifyAccess = (
    targetGroups: Uuid[],
    docType: DocType,
    permission: AclPermission,
    validation: "any" | "all" = "any",
) => {
    for (const targetGroup of targetGroups) {
        if (
            accessMap.value[targetGroup] &&
            accessMap.value[targetGroup][docType] &&
            accessMap.value[targetGroup][docType]![permission]
        ) {
            if (validation === "any") {
                return true;
            }
        } else {
            if (validation === "all") {
                return false;
            }
        }
    }
    if (validation === "all") {
        return true;
    }

    return false;
};

/**
 * Verify if the user has access to any group for the specified document type and permission.
 */
export const hasAnyPermission = (docType: DocType, permission: AclPermission) => {
    return verifyAccess(Object.keys(accessMap.value), docType, permission);
};

/**
 * Get a list of accessible groups per document type for a given permission
 */
export function getAccessibleGroups(permission: AclPermission): Record<DocType, Uuid[]> {
    const groups: Record<DocType, Uuid[]> = {} as Record<DocType, Uuid[]>;

    Object.keys(accessMap.value).forEach((groupId: Uuid) => {
        Object.keys(accessMap.value[groupId as Uuid]).forEach((docType) => {
            const docTypePermissions = accessMap.value[groupId as Uuid][docType as DocType];

            if (!docTypePermissions) return;
            Object.keys(docTypePermissions)
                .filter((p) => p === permission)
                .forEach((_permission) => {
                    if (docTypePermissions[_permission as AclPermission]) {
                        if (!groups[docType as DocType]) groups[docType as DocType] = [];
                        groups[docType as DocType]?.push(groupId as Uuid);
                    }
                });
        });
    });
    return groups;
}
