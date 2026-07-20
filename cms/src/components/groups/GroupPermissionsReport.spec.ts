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
                        groupId: "group-target",
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
                        groupId: "group-parent",
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
        expect(report).toHaveProperty("group-target");

        const targetReport = report["group-target"];
        expect(targetReport.accessorGroupId).toBe("group-target");
        expect(targetReport.accessorGroupName).toBe("Target");
        expect(targetReport.source).toBe("direct");
        expect(targetReport.permissionsByDocType[DocType.Post]).toContain(AclPermission.View);
        expect(Object.keys(report).length).toBeGreaterThan(0);
    });

    it("stops walking when it encounters a parent cycle", () => {
        const groups: GroupDto[] = [
            {
                _id: "group-a",
                type: DocType.Group,
                name: "Group A",
                updatedTimeUtc: 1,
                acl: [
                    {
                        groupId: "group-a",
                        type: DocType.Post,
                        permission: [AclPermission.View],
                    },
                ],
            } as GroupDto,
            {
                _id: "group-b",
                type: DocType.Group,
                name: "Group B",
                updatedTimeUtc: 2,
                acl: [
                    {
                        groupId: "group-b",
                        type: DocType.Post,
                        permission: [AclPermission.Edit],
                    },
                ],
            } as GroupDto,
        ];

        const report = buildEffectivePermissionsReport("group-a", groups);

        expect(report).toHaveProperty("group-a");

        const groupAReport = report["group-a"];
        expect(groupAReport.source).toBe("direct");
        expect(groupAReport.permissionsByDocType[DocType.Post]).toContain(AclPermission.View);
        expect(report["group-a"]).toBeDefined();
    });
});
