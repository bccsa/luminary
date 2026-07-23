import { describe, expect, it } from "vitest";
import { AclPermission, DocType, type GroupDto } from "luminary-shared";
import { buildEffectivePermissionsReport } from "./GroupPermissionsReport";

describe("buildEffectivePermissionsReport", () => {
    it("builds a report with direct and inherited permissions", () => {
        const groups: GroupDto[] = [
            {
                _id: "group-target",
                type: DocType.Group,
                name: "Target",
                updatedTimeUtc: 1,
                acl: [
                    {
                        groupId: "group-parent",
                        type: DocType.Post,
                        permission: [AclPermission.View],
                    },
                ],
            } as GroupDto,
            {
                _id: "group-parent",
                type: DocType.Group,
                name: "Parent",
                updatedTimeUtc: 2,
                acl: [
                    {
                        groupId: "group-grandparent",
                        type: DocType.Post,
                        permission: [AclPermission.Edit],
                    },
                ],
            } as GroupDto,
            {
                _id: "group-grandparent",
                type: DocType.Group,
                name: "Grandparent",
                updatedTimeUtc: 3,
                acl: [
                    {
                        groupId: "group-grandparent",
                        type: DocType.Post,
                        permission: [AclPermission.View, AclPermission.Edit],
                    },
                ],
            } as GroupDto,
        ];

        const report = buildEffectivePermissionsReport("group-target", groups);

        expect(report.length).toBeGreaterThan(0);
    });

    it("deduplicates multiple paths by keeping the shortest one", () => {
        const groups: GroupDto[] = [
            {
                _id: "target",
                type: DocType.Group,
                name: "Target",
                updatedTimeUtc: 1,
                acl: [
                    { groupId: "A", type: DocType.Post, permission: [AclPermission.View] },
                    { groupId: "B", type: DocType.Post, permission: [AclPermission.View] },
                ],
            } as GroupDto,
            {
                _id: "A",
                type: DocType.Group,
                name: "A",
                updatedTimeUtc: 2,
                acl: [{ groupId: "C", type: DocType.Post, permission: [AclPermission.View] }],
            } as GroupDto,
            {
                _id: "B",
                type: DocType.Group,
                name: "B",
                updatedTimeUtc: 3,
                acl: [
                    { groupId: "A", type: DocType.Post, permission: [AclPermission.View] },
                    { groupId: "C", type: DocType.Post, permission: [AclPermission.View] },
                ],
            } as GroupDto,
            {
                _id: "C",
                type: DocType.Group,
                name: "Group C",
                updatedTimeUtc: 4,
                acl: [],
            } as GroupDto,
        ];

        const report = buildEffectivePermissionsReport("target", groups);
        const groupCReports = report.filter((r) => r.accessorGroupId === "C");

        expect(groupCReports.length).toBe(1);
    });

    it("handles cycles without infinite loop", () => {
        const groups: GroupDto[] = [
            {
                _id: "a",
                type: DocType.Group,
                name: "Group A",
                updatedTimeUtc: 1,
                acl: [{ groupId: "b", type: DocType.Post, permission: [AclPermission.View] }],
            } as GroupDto,
            {
                _id: "b",
                type: DocType.Group,
                name: "Group B",
                updatedTimeUtc: 2,
                acl: [{ groupId: "a", type: DocType.Post, permission: [AclPermission.Edit] }],
            } as GroupDto,
        ];

        const report = buildEffectivePermissionsReport("a", groups);

        expect(report.length).toBeGreaterThan(0);
    });
});
