import { Ref, computed, readonly } from "vue";
import { DocType, Uuid, AclPermission } from "../types";
import { useLocalStorage } from "@vueuse/core";

export type AccessMap = {
    [T: Uuid]: { [U in DocType]?: { [V in AclPermission]?: boolean | undefined } };
};

const _accessMap: Ref<AccessMap> = useLocalStorage("accessMap", {});
/**
 * Access map for the current user as a Vue readonly ref
 */
export const accessMap = readonly(_accessMap);

/**
 * Set the access map for the current user
 */
export const setAccessMap = (newAccessMap: AccessMap) => {
    _accessMap.value = newAccessMap;
};

/**
 * Verify if the user has access to a group for the specified document type and permission.
 * This is a computed function to allow for reactivity.
 */
export const verifyAccess = computed(
    () =>
        (
            accessMap: Ref<AccessMap>,
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
        },
);

/**
 * Verify if the user has access to any group for the specified document type and permission.
 * This is a computed function to allow for reactivity.
 */
export const hasAnyPermission = computed(
    () => (accessMap: Ref<AccessMap>, docType: DocType, permission: AclPermission) => {
        return verifyAccess.value(accessMap, Object.keys(accessMap.value), docType, permission);
    },
);

/**
 * Convert an access map to a list of accessible groups per document type for a given permission
 */
export function accessMapToGroups(
    accessMap: AccessMap,
    permission: AclPermission,
): Record<DocType, Uuid[]> {
    const groups: Record<DocType, Uuid[]> = {} as Record<DocType, Uuid[]>;

    Object.keys(accessMap).forEach((groupId: Uuid) => {
        Object.keys(accessMap[groupId as Uuid]).forEach((docType) => {
            const docTypePermissions = accessMap[groupId as Uuid][docType as DocType];

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
