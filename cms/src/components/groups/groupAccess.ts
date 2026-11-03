import { AclPermission, DocType, type GroupDto } from "luminary-shared";

/**
 * The ids of the groups whose members hold `permission` on `docType` documents that are
 * members of `targetGroupId`, directly or by inheritance. A group inherits the access of any
 * group it has ACL access to, mirroring the API's PermissionSystem.
 */
export function groupsWithAccess(
    targetGroupId: string,
    docType: DocType,
    permission: AclPermission,
    allGroups: GroupDto[],
): Set<string> {
    const groupsById = new Map(allGroups.map((g) => [g._id, g]));
    const target = groupsById.get(targetGroupId);
    if (!target) return new Set();

    const accessors = new Set(
        target.acl
            .filter((a) => a.type === docType && a.permission.includes(permission))
            .map((a) => a.groupId),
    );

    // Whoever has any access to an accessor group inherits that accessor's access.
    const queue = [...accessors];
    while (queue.length) {
        const group = groupsById.get(queue.shift()!);
        group?.acl
            .filter((a) => a.permission.length > 0)
            .forEach((a) => {
                if (accessors.has(a.groupId)) return;
                accessors.add(a.groupId);
                queue.push(a.groupId);
            });
    }

    return accessors;
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
