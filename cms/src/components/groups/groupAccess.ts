import { AclPermission, DocType, type GroupDto } from "luminary-shared";

/**
 * The ids of the groups whose members hold `permission` on `docType` documents that are
 * members of `targetGroupId`, directly or by inheritance, mirroring the API's PermissionSystem:
 * a group holding the permission on any group that can reach the target holds it on the target,
 * and so does any group that can reach that group.
 */
export function groupsWithAccess(
    targetGroupId: string,
    docType: DocType,
    permission: AclPermission,
    allGroups: GroupDto[],
): Set<string> {
    const groupsById = new Map(allGroups.map((g) => [g._id, g]));
    if (!groupsById.has(targetGroupId)) return new Set();

    // The given groups plus every group with any ACL access to one of them, transitively.
    const withAnyAccessTo = (groupIds: string[]) => {
        const found = new Set(groupIds);
        const queue = [...groupIds];
        while (queue.length) {
            groupsById
                .get(queue.shift()!)
                ?.acl.filter((a) => a.permission.length > 0 && !found.has(a.groupId))
                .forEach((a) => {
                    found.add(a.groupId);
                    queue.push(a.groupId);
                });
        }
        return found;
    };

    const holders = [...withAnyAccessTo([targetGroupId])].flatMap(
        (id) =>
            groupsById
                .get(id)
                ?.acl.filter((a) => a.type === docType && a.permission.includes(permission))
                .map((a) => a.groupId) ?? [],
    );

    return withAnyAccessTo(holders);
}

/**
 * The groups that can view a document (in `contentGroupIds`) but have no View access to a doc
 * type it depends on (in `dependencyGroupIds`), so their members would see the document but
 * never receive what it needs, e.g. the storage bucket holding its media.
 */
export function groupsMissingDependencyAccess(
    contentGroupIds: string[],
    contentDocType: DocType,
    dependencyGroupIds: string[],
    dependencyDocType: DocType,
    allGroups: GroupDto[],
): GroupDto[] {
    if (!dependencyGroupIds.length) return [];

    const viewers = new Set(
        contentGroupIds.flatMap((id) => [
            ...groupsWithAccess(id, contentDocType, AclPermission.View, allGroups),
        ]),
    );
    const withAccess = new Set(
        dependencyGroupIds.flatMap((id) => [
            ...groupsWithAccess(id, dependencyDocType, AclPermission.View, allGroups),
        ]),
    );

    return allGroups.filter((g) => viewers.has(g._id) && !withAccess.has(g._id));
}
