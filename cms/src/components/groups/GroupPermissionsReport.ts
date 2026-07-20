import { AclPermission, type GroupDto } from "luminary-shared";

export interface AccessorReport {
    accessorGroupId: string;
    accessorGroupName: string;
    source: "direct" | "inherited";
    inheritedViaGroupName?: string;
    permissionsByDocType: Record<string, AclPermission[]>;
}

export type EffectivePermissionsReport = Record<string, AccessorReport>;

export const buildEffectivePermissionsReport = (
    targetGroupId: string,
    allGroups: GroupDto[],
): EffectivePermissionsReport => {
    const targetGroup = allGroups.find((g) => g._id === targetGroupId);
    if (!targetGroup || !targetGroup.acl) return {};

    const aggregated: EffectivePermissionsReport = {};

    targetGroup.acl.forEach((initialAcl) => {
        const queue: {
            currentGroupId: string;
            viaGroup: GroupDto | null;
            isDirect: boolean;
        }[] = [{ currentGroupId: initialAcl.groupId, viaGroup: null, isDirect: true }];

        const visited = new Set<string>();

        while (queue.length > 0) {
            const { currentGroupId, viaGroup, isDirect } = queue.shift()!;
            if (visited.has(currentGroupId)) continue;
            visited.add(currentGroupId);

            const accessorGroup = allGroups.find((g) => g._id === currentGroupId);
            if (!accessorGroup) continue;

            if (!aggregated[currentGroupId]) {
                aggregated[currentGroupId] = {
                    accessorGroupId: currentGroupId,
                    accessorGroupName: accessorGroup.name,
                    source: isDirect ? "direct" : "inherited",
                    inheritedViaGroupName: viaGroup?.name,
                    permissionsByDocType: {},
                };
            }

            const reportEntry = aggregated[currentGroupId];
            const docTypeKey = initialAcl.type;

            if (!reportEntry.permissionsByDocType[docTypeKey]) {
                reportEntry.permissionsByDocType[docTypeKey] = [];
            }

            const allPossiblePermissions = Object.values(AclPermission);

            reportEntry.permissionsByDocType[docTypeKey] = allPossiblePermissions.filter(
                (p) =>
                    initialAcl.permission.includes(p) ||
                    reportEntry.permissionsByDocType[docTypeKey].includes(p),
            );

            initialAcl.permission.forEach((p) => {
                if (!reportEntry.permissionsByDocType[docTypeKey].includes(p)) {
                    reportEntry.permissionsByDocType[docTypeKey].push(p);
                }
            });

            const currentGroup = allGroups.find((g) => g._id === currentGroupId);
            if (!currentGroup || !currentGroup.acl) continue;

            const groupsInAcl = currentGroup.acl
                .map((aclEntry) => aclEntry.groupId)
                .filter((id, index, self) => self.indexOf(id) === index);

            groupsInAcl.forEach((groupId) => {
                if (!visited.has(groupId)) {
                    queue.push({
                        currentGroupId: groupId,
                        viaGroup: accessorGroup,
                        isDirect: false,
                    });
                }
            });
        }
    });

    return aggregated;
};
