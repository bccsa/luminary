import { Ref, ref } from "vue";
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
 * Whether the server resolved the current {@link accessMap} from a matched User document. Delivered
 * alongside the map on the socket's `clientConfig` event.
 *
 * `false` means the map carries only the server's default + dynamically-assigned groups: either the
 * connection is anonymous, or its token is valid but no User document matched it. In that second
 * case the map is a strict, silent subset of the identity's real access — indistinguishable in shape
 * from a genuine revocation. A consumer that treats access loss as a signal to delete local
 * documents (see `db.deleteRevoked`) must not act on an unlinked map.
 *
 * Deliberately NOT persisted: it describes the live connection, and a stale `true` restored from
 * storage before the first `clientConfig` would defeat the guard. Defaults to `true` so a server
 * predating this field keeps the pre-existing behaviour (ADR 0005).
 */
export const identityLinked: Ref<boolean> = ref(true);

/**
 * Verify if the user has access to a group for the specified document type and permission.
 *
 * The permission is taken at face value — callers choose it explicitly. In particular, CMS
 * visibility is gated by `CmsView`, so CMS consumers pass `AclPermission.CmsView` here (and to
 * {@link getAccessibleGroups}); the app passes `AclPermission.View`. (GitHub #160 — there is no
 * implicit View→CmsView substitution; the distinction lives at the call site.)
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
