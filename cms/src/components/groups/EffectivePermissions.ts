import { AclPermission, type GroupDto } from "luminary-shared";

export interface AccessorReport {
    accessorGroupId: string;
    accessorGroupName: string;
    source: "direct" | "inherited";
    inheritedViaGroupName?: string;
    permissionsByDocType: Record<string, AclPermission[]>;
    path: string[];
}

export const buildEffectivePermissionsReport = (
    targetGroupId: string,
    allGroups: GroupDto[],
    maxDepth: number = 10,
): AccessorReport[] => {
    const targetGroup = allGroups.find((g) => g._id === targetGroupId);
    if (!targetGroup || !targetGroup.acl) return [];

    const groupsById = new Map(allGroups.map((g) => [g._id, g]));
    const results = new Map<string, AccessorReport>();

    const processed = new Set<string>();

    const queue: {
        groupId: string;
        viaGroupName?: string;
        path: string[];
        docType: string;
        permissions: AclPermission[];
    }[] = [];

    targetGroup.acl.forEach((acl) => {
        queue.push({
            groupId: acl.groupId,
            path: [acl.groupId],
            docType: acl.type,
            permissions: acl.permission,
        });
    });

    while (queue.length > 0) {
        const { groupId, viaGroupName, path, docType, permissions } = queue.shift()!;

        if (path.length > maxDepth) continue;

        const processKey = `${path.join("->")}|${docType}`;
        if (processed.has(processKey)) continue;
        processed.add(processKey);

        const group = groupsById.get(groupId);
        if (!group) continue;

        const pathKey = path.join("->");
        if (!results.has(pathKey)) {
            results.set(pathKey, {
                accessorGroupId: groupId,
                accessorGroupName: group.name,
                source: path.length === 1 ? "direct" : "inherited",
                inheritedViaGroupName: viaGroupName,
                permissionsByDocType: {},
                path: [...path],
            });
        }

        const entry = results.get(pathKey)!;

        const merged = [
            ...new Set([...(entry.permissionsByDocType[docType] || []), ...permissions]),
        ];
        entry.permissionsByDocType[docType] = Object.values(AclPermission).filter((p) =>
            merged.includes(p),
        );

        if (group.acl) {
            group.acl.forEach((nextAcl) => {
                if (!path.includes(nextAcl.groupId)) {
                    queue.push({
                        groupId: nextAcl.groupId,
                        viaGroupName: group.name,
                        path: [...path, nextAcl.groupId],
                        docType: nextAcl.type,
                        permissions: nextAcl.permission,
                    });
                }
            });
        }
    }

    const deduplicated = new Map<string, AccessorReport>();

    Array.from(results.values()).forEach((report) => {
        const permissionSignature = JSON.stringify(report.permissionsByDocType);
        const uniqueSignature = `${report.accessorGroupId}|${permissionSignature}`;

        const existing = deduplicated.get(uniqueSignature);

        if (!existing) {
            deduplicated.set(uniqueSignature, report);
        } else {
            if (report.path.length < existing.path.length) {
                deduplicated.set(uniqueSignature, report);
            }
        }
    });

    return Array.from(deduplicated.values()).filter((report) => report.source === "inherited");
};
