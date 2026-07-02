import { verifyAccess, AclPermission, DocType, type GroupDto, type Uuid } from "luminary-shared";

/**
 * Groups the current user can both Edit and Assign — i.e. the groups they may grant on a document.
 * Used to populate group pickers across the CMS.
 */
export function assignableGroups(groups: GroupDto[]): GroupDto[] {
    return groups.filter(
        (g) =>
            verifyAccess([g._id], DocType.Group, AclPermission.Edit) &&
            verifyAccess([g._id], DocType.Group, AclPermission.Assign),
    );
}

/**
 * Label for a group id: its name if resolvable in `groups`, otherwise the id itself
 * (not synced / no CmsView permission / deleted).
 */
export function groupLabel(groupId: Uuid, groups: GroupDto[]): string {
    return groups.find((g) => g._id === groupId)?.name ?? groupId;
}
