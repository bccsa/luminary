import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach, afterAll, beforeAll } from "vitest";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import { mockGroupDtoPublicContent, superAdminAccessMap } from "@/tests/mockdata";
import { db, accessMap, AclPermission, DocType, type GroupAclEntryDto } from "luminary-shared";
import {
    hasChangedPermission,
    isPermissionAvailable,
    validateAclEntry,
    validDocTypes,
} from "./permissions";

describe("Group editor permissions (permissions.ts)", () => {
    beforeAll(() => {
        accessMap.value = superAdminAccessMap;
    });

    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        db.docs.clear();
        db.localChanges.clear();
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("returns valid document types that can be used for ACL assignments", async () => {
        expect(Array.isArray(validDocTypes)).toBe(true);
        expect(validDocTypes.includes(DocType.Group)).toBe(true);
        expect(validDocTypes.includes(DocType.Language)).toBe(true);
        expect(validDocTypes.includes(DocType.Post)).toBe(true);
        expect(validDocTypes.includes(DocType.Tag)).toBe(true);
        expect(validDocTypes.includes(DocType.User)).toBe(true);
    });

    it("can check if a permission is available for a given DocType", async () => {
        const res1 = isPermissionAvailable.value(DocType.Group, AclPermission.View);
        expect(res1).toBe(true);

        const res2 = isPermissionAvailable.value(DocType.Language, AclPermission.Edit);
        expect(res2).toBe(true);

        const res3 = isPermissionAvailable.value(DocType.User, AclPermission.Assign);
        expect(res3).toBe(false);
    });

    it("can check if the acl entry permission has changed compared to the original group's acl", async () => {
        const group = mockGroupDtoPublicContent;

        group.acl = [
            {
                groupId: "group-super-admins",
                type: DocType.Group,
                permission: [AclPermission.View, AclPermission.Assign],
            },
        ];

        // Test no change to be false
        expect(
            hasChangedPermission.value(
                {
                    groupId: "group-super-admins",
                    type: DocType.Group,
                    permission: [AclPermission.View, AclPermission.Assign],
                },
                AclPermission.View,
                group,
            ),
        ).toBe(false);

        // Test addition to be true
        expect(
            hasChangedPermission.value(
                {
                    groupId: "group-super-admins",
                    type: DocType.Group,
                    permission: [AclPermission.View, AclPermission.Assign, AclPermission.Edit],
                },
                AclPermission.Edit,
                group,
            ),
        ).toBe(true);

        // Test removal to be true
        expect(
            hasChangedPermission.value(
                {
                    groupId: "group-super-admins",
                    type: DocType.Group,
                    permission: [AclPermission.View],
                },
                AclPermission.Assign,
                group,
            ),
        ).toBe(true);

        // Test addition of new DocType to be true
        expect(
            hasChangedPermission.value(
                {
                    groupId: "group-super-admins",
                    type: DocType.Language,
                    permission: [AclPermission.View],
                },
                AclPermission.View,
                group,
            ),
        ).toBe(true);

        // Test addition of new assigned group to be true
        expect(
            hasChangedPermission.value(
                {
                    groupId: "group-public-users",
                    type: DocType.Group,
                    permission: [AclPermission.View],
                },
                AclPermission.View,
                group,
            ),
        ).toBe(true);

        // Test removal of aclEntry to be true
        expect(
            hasChangedPermission.value(
                {
                    groupId: "group-super-admins",
                    type: DocType.Group,
                    permission: [],
                },
                AclPermission.View,
                group,
            ),
        ).toBe(true);
    });

    describe("ACL entry permissions validation", () => {
        it("can automatically set the 'visible' permission if any other permission is set", async () => {
            const aclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.Assign],
            };

            const prevAclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [],
            };

            validateAclEntry(aclEntry, prevAclEntry);

            expect(aclEntry.permission.includes(AclPermission.View)).toBe(true);
        });

        it("can automatically clear all permissions if the 'visible' permission is cleared", async () => {
            const aclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.Assign],
            };

            const prevAclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.View, AclPermission.Assign],
            };

            validateAclEntry(aclEntry, prevAclEntry);

            expect(aclEntry.permission.length).toBe(0);
        });

        it("can automatically set the 'assign' permission on a group if the 'edit' permission is set", async () => {
            const aclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.View, AclPermission.Edit],
            };

            const prevAclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.View],
            };

            validateAclEntry(aclEntry, prevAclEntry);

            expect(aclEntry.permission.includes(AclPermission.Edit)).toBe(true);
            expect(aclEntry.permission.includes(AclPermission.Assign)).toBe(true);
        });

        it("can automatically clear the 'edit' permission on a group if the 'assign' permission is cleared", async () => {
            const aclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.View, AclPermission.Edit],
            };

            const prevAclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.View, AclPermission.Edit, AclPermission.Assign],
            };

            validateAclEntry(aclEntry, prevAclEntry);

            expect(aclEntry.permission.includes(AclPermission.Edit)).toBe(false);
            expect(aclEntry.permission.includes(AclPermission.Assign)).toBe(false);
        });
    });
});
