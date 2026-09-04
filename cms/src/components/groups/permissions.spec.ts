import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach, afterAll, beforeAll } from "vitest";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import { mockGroupDtoPublicContent, superAdminAccessMap } from "@/tests/mockdata";
import { accessMap, AclPermission, db, DocType, type GroupAclEntryDto } from "luminary-shared";
import {
    hasChangedPermission,
    isPermissionAvailable,
    toggleAclEntry,
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

    describe("ACL entry toggling", () => {
        it("sets 'cmsView' only when switching an entry on", async () => {
            const aclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [],
            };

            toggleAclEntry(aclEntry);

            expect(aclEntry.permission).toEqual([AclPermission.CmsView]);
        });

        it("clears all permissions when switching an entry off", async () => {
            const aclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.View, AclPermission.CmsView, AclPermission.Assign],
            };

            toggleAclEntry(aclEntry);

            expect(aclEntry.permission).toEqual([]);
        });
    });

    describe("ACL entry permissions validation", () => {
        it("automatically sets 'cmsView', and not 'view', when another permission is set", async () => {
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

            expect(aclEntry.permission.includes(AclPermission.CmsView)).toBe(true);
            expect(aclEntry.permission.includes(AclPermission.View)).toBe(false);
        });

        // The server applies the same rule, so the CMS may not show a state that reverts on sync.
        it("restores 'cmsView' when it is cleared while a CMS-only permission and 'view' remain", async () => {
            const aclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.View, AclPermission.Assign],
            };

            const prevAclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.View, AclPermission.CmsView, AclPermission.Assign],
            };

            validateAclEntry(aclEntry, prevAclEntry);

            expect(aclEntry.permission).toEqual([
                AclPermission.View,
                AclPermission.Assign,
                AclPermission.CmsView,
            ]);
        });

        it("sets 'cmsView' when a CMS-only permission is added to a 'view'-only entry", async () => {
            const aclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.View, AclPermission.Assign],
            };

            const prevAclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.View],
            };

            validateAclEntry(aclEntry, prevAclEntry);

            expect(aclEntry.permission).toContain(AclPermission.CmsView);
        });

        it("leaves a 'view'-only entry alone", async () => {
            const aclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.View],
            };

            const prevAclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.View, AclPermission.CmsView],
            };

            validateAclEntry(aclEntry, prevAclEntry);

            expect(aclEntry.permission).toEqual([AclPermission.View]);
        });

        it("clears the entry when 'cmsView' is cleared and 'view' was not set", async () => {
            const aclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.Assign],
            };

            const prevAclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.CmsView, AclPermission.Assign],
            };

            validateAclEntry(aclEntry, prevAclEntry);

            expect(aclEntry.permission.length).toBe(0);
        });

        it("keeps the CMS permissions when 'view' is cleared", async () => {
            const aclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.CmsView, AclPermission.Assign],
            };

            const prevAclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.View, AclPermission.CmsView, AclPermission.Assign],
            };

            validateAclEntry(aclEntry, prevAclEntry);

            expect(aclEntry.permission.includes(AclPermission.View)).toBe(false);
            expect(aclEntry.permission.includes(AclPermission.CmsView)).toBe(true);
            expect(aclEntry.permission.includes(AclPermission.Assign)).toBe(true);
        });

        it("can automatically set the 'assign' permission on a group if the 'edit' permission is set", async () => {
            const aclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.View, AclPermission.CmsView, AclPermission.Edit],
            };

            const prevAclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.View, AclPermission.CmsView],
            };

            validateAclEntry(aclEntry, prevAclEntry);

            expect(aclEntry.permission.includes(AclPermission.Edit)).toBe(true);
            expect(aclEntry.permission.includes(AclPermission.Assign)).toBe(true);
        });

        it("can automatically clear the 'edit' permission on a group if the 'assign' permission is cleared", async () => {
            const aclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [AclPermission.View, AclPermission.CmsView, AclPermission.Edit],
            };

            const prevAclEntry: GroupAclEntryDto = {
                groupId: "group-public-users",
                type: DocType.Group,
                permission: [
                    AclPermission.View,
                    AclPermission.CmsView,
                    AclPermission.Edit,
                    AclPermission.Assign,
                ],
            };

            validateAclEntry(aclEntry, prevAclEntry);

            expect(aclEntry.permission.includes(AclPermission.Edit)).toBe(false);
            expect(aclEntry.permission.includes(AclPermission.Assign)).toBe(false);
        });
    });
});

describe("Share permission", () => {
    it.each([DocType.Post, DocType.Tag])("is available on %s", (docType) => {
        expect(isPermissionAvailable.value(docType, AclPermission.Share)).toBe(true);
    });

    it.each([
        DocType.Group,
        DocType.Language,
        DocType.User,
        DocType.Redirect,
        DocType.Storage,
        DocType.AuthProvider,
        DocType.AutoGroupMappings,
    ])("is not available on %s", (docType) => {
        expect(isPermissionAvailable.value(docType, AclPermission.Share)).toBe(false);
    });

    it("does not imply CmsView", () => {
        const aclEntry: GroupAclEntryDto = {
            groupId: "group-public-users",
            type: DocType.Post,
            permission: [AclPermission.View, AclPermission.Share],
        };

        const prevAclEntry: GroupAclEntryDto = {
            groupId: "group-public-users",
            type: DocType.Post,
            permission: [AclPermission.View],
        };

        validateAclEntry(aclEntry, prevAclEntry);

        expect(aclEntry.permission).toEqual([AclPermission.View, AclPermission.Share]);
    });

    it("is cleared when no visibility permission remains", () => {
        const aclEntry: GroupAclEntryDto = {
            groupId: "group-public-users",
            type: DocType.Post,
            permission: [AclPermission.Share],
        };

        const prevAclEntry: GroupAclEntryDto = {
            groupId: "group-public-users",
            type: DocType.Post,
            permission: [AclPermission.View, AclPermission.Share],
        };

        validateAclEntry(aclEntry, prevAclEntry);

        expect(aclEntry.permission).toEqual([]);
    });
});
