import { PermissionSystem } from "./permissions.service";
import { DocType, AclPermission } from "../enums";
import { createTestingModule } from "../test/testingModule";

describe("PermissionService", () => {
    beforeAll(async () => {
        await createTestingModule("permission-service");

        // Wait a little bit for the permission system to update
        function timeout() {
            return new Promise((resolve) => {
                setTimeout(resolve, 500);
            });
        }
        await timeout();
    });

    it("can be instantiated", () => {
        expect(PermissionSystem.upsertGroups).toBeDefined();
        expect(PermissionSystem.removeGroups).toBeDefined();
    });

    // We do this before the model tests, as the model tests modifies the data set
    describe("Data extraction tests", () => {
        it("can extract an AccessMap", () => {
            const accessMap = PermissionSystem.getAccessMap(["group-public-users"]);
            expect(accessMap).toBeDefined();
            expect(accessMap["group-public-content"][DocType.Post][AclPermission.View]).toBe(true);
        });

        it("can convert an AccessMap to a map of accessible groups", () => {
            const accessMap = PermissionSystem.getAccessMap(["group-public-users"]);
            const accessibleGroups = PermissionSystem.accessMapToGroups(
                accessMap,
                AclPermission.View,
                [DocType.Post, DocType.Tag],
            );
            expect(accessibleGroups).toBeDefined();
            expect(accessibleGroups[DocType.Post].length).toBe(2);
            expect(accessibleGroups[DocType.Tag].length).toBe(2);
            expect(accessibleGroups[DocType.Post].includes("group-public-content")).toBe(true);
            expect(accessibleGroups[DocType.Tag].includes("group-public-content")).toBe(true);
            expect(accessibleGroups[DocType.Post].includes("group-languages")).toBe(true);
            expect(accessibleGroups[DocType.Tag].includes("group-languages")).toBe(true);
        });

        it("can calculate a diff on an AccessMap", () => {
            const accessMap1 = new Map<string, Map<DocType, Map<AclPermission, boolean>>>();
            accessMap1["group-public-users"] = new Map<DocType, Map<AclPermission, boolean>>();
            accessMap1["group-public-users"][DocType.Post] = new Map<AclPermission, boolean>();
            accessMap1["group-public-users"][DocType.Post][AclPermission.View] = true;
            accessMap1["group-public-users"][DocType.Tag] = new Map<AclPermission, boolean>();
            accessMap1["group-public-users"][DocType.Tag][AclPermission.View] = true;
            accessMap1["group-public-users"][DocType.Tag][AclPermission.Edit] = true;
            accessMap1["group-private-users"] = new Map<DocType, Map<AclPermission, boolean>>();
            accessMap1["group-private-users"][DocType.Post] = new Map<AclPermission, boolean>();
            accessMap1["group-private-users"][DocType.Post][AclPermission.View] = true;

            const accessMap2 = new Map<string, Map<DocType, Map<AclPermission, boolean>>>();
            accessMap2["group-public-users"] = new Map<DocType, Map<AclPermission, boolean>>();
            accessMap2["group-public-users"][DocType.Post] = new Map<AclPermission, boolean>();
            accessMap2["group-public-users"][DocType.Post][AclPermission.View] = true;

            const diff = PermissionSystem.accessMapDiff(accessMap1, accessMap2);
            expect(diff).toBeDefined();
            expect(diff["group-private-users"][DocType.Post][AclPermission.View]).toBe(true);
            expect(diff["group-public-users"][DocType.Tag][AclPermission.View]).toBe(true);
            expect(diff["group-public-users"][DocType.Tag][AclPermission.Edit]).toBe(true);
        });

        it("accessMapDiff: returns the first AccessMap second AccessMap is invalid", () => {
            const accessMap1 = new Map<string, Map<DocType, Map<AclPermission, boolean>>>();
            accessMap1["group-public-users"] = new Map<DocType, Map<AclPermission, boolean>>();
            accessMap1["group-public-users"][DocType.Post] = new Map<AclPermission, boolean>();
            accessMap1["group-public-users"][DocType.Post][AclPermission.View] = true;

            const accessMap2 = {
                invalidData: "invalidData",
            };

            // @ts-expect-error We are testing the error case
            const diff = PermissionSystem.accessMapDiff(accessMap1, accessMap2);
            expect(diff).toBeDefined();
            expect(diff["group-public-users"][DocType.Post][AclPermission.View]).toBe(true);
        });
    });

    describe("Model tests", () => {
        it("can get accessible groups per document type and permission", () => {
            const res1 = PermissionSystem.getAccessibleGroups(
                [DocType.Post, DocType.Language],
                AclPermission.Edit,
                ["group-public-editors"],
            );

            expect(res1[DocType.Post].length).toBe(2);
            expect(res1[DocType.Post].includes("group-public-content")).toBe(true);
            expect(res1[DocType.Post].includes("group-languages")).toBe(true);

            const res2 = PermissionSystem.getAccessibleGroups(
                [DocType.Post, DocType.Language],
                AclPermission.Edit,
                ["group-public-editors", "group-private-editors"],
            );

            expect(res2[DocType.Post].length).toBe(3);
            expect(res2[DocType.Post].includes("group-public-content")).toBe(true);
            expect(res2[DocType.Post].includes("group-private-content")).toBe(true);
            expect(res2[DocType.Post].includes("group-languages")).toBe(true);
        });

        it("can verify access to two target groups with verification type 'any'", () => {
            expect(
                PermissionSystem.verifyAccess(
                    ["group-public-content", "group-private-content"],
                    DocType.Language,
                    AclPermission.View,
                    ["group-public-users"],
                    "any",
                ),
            ).toBe(true);
        });

        it("can verify access to two target groups with verification type 'all'", () => {
            expect(
                PermissionSystem.verifyAccess(
                    ["group-public-content", "group-private-content"],
                    DocType.Post,
                    AclPermission.View,
                    ["group-public-users"],
                    "all",
                ),
            ).toBe(false);

            expect(
                PermissionSystem.verifyAccess(
                    ["group-public-content", "group-private-content"],
                    DocType.Post,
                    AclPermission.View,
                    ["group-private-users"],
                    "all",
                ),
            ).toBe(true);
        });

        it("can verify access to two target groups with verification type 'all' from two user groups of which only one group has access", () => {
            expect(
                PermissionSystem.verifyAccess(
                    ["group-public-content", "group-private-content"],
                    DocType.Post,
                    AclPermission.View,
                    ["group-languages", "group-private-users"], // We are using group-languages as it has no access to the target groups. We are putting it first to make sure it is tested.
                    "all",
                ),
            ).toBe(true);
        });

        it("can calculate inherited groups", () => {
            // group-super-admins is the top level group in the testing data set, and group-language the lowest level group.
            // Test if inheritance is replicated through the whole testing data set.
            expect(
                PermissionSystem.verifyAccess(
                    ["group-languages"],
                    DocType.Language,
                    AclPermission.View,
                    ["group-super-admins"],
                ),
            ).toBe(true);
        });

        it("can update inherited groups", () => {
            // Use modified version of existing document in test data set and see if it successfully updates the permission system
            PermissionSystem.upsertGroups([
                {
                    _id: "group-languages",
                    type: "group",
                    updatedTimeUtc: 3,
                    name: "Languages",
                    acl: [
                        {
                            type: "language",
                            groupId: "group-public-content",
                            permission: ["view"],
                        },
                        {
                            type: "language",
                            groupId: "group-private-content",
                            permission: ["view", "translate"],
                        },
                        {
                            type: "language",
                            groupId: "group-public-editors",
                            permission: ["view"],
                        },
                        {
                            type: "language",
                            groupId: "group-private-editors",
                            permission: ["view", "translate"],
                        },
                    ],
                },
            ]);

            expect(
                PermissionSystem.verifyAccess(
                    ["group-languages"],
                    DocType.Language,
                    AclPermission.Translate,
                    ["group-private-content"],
                ),
            ).toBe(true);
            expect(
                PermissionSystem.verifyAccess(
                    ["group-languages"],
                    DocType.Language,
                    AclPermission.Translate,
                    ["group-public-editors"],
                ),
            ).toBe(false);
        });

        it("can remove a group", () => {
            PermissionSystem.removeGroups(["group-languages"]);

            // Check if the (removed) inherited group is removed from the top level parent
            expect(
                PermissionSystem.verifyAccess(
                    ["group-languages"],
                    DocType.Language,
                    AclPermission.View,
                    ["group-super-admins"],
                ),
            ).toBe(false);

            // Restore group for further tests
            PermissionSystem.upsertGroups([
                {
                    _id: "group-languages",
                    type: "group",
                    updatedTimeUtc: 3,
                    name: "Languages",
                    acl: [
                        {
                            type: "language",
                            groupId: "group-public-content",
                            permission: ["view"],
                        },
                        {
                            type: "language",
                            groupId: "group-private-content",
                            permission: ["view", "translate"],
                        },
                        {
                            type: "language",
                            groupId: "group-public-editors",
                            permission: ["view", "translate"],
                        },
                        {
                            type: "language",
                            groupId: "group-private-editors",
                            permission: ["view", "translate"],
                        },
                    ],
                },
            ]);
        });

        it("can remove an ACL", () => {
            // Update an existing document with less ACL entries
            PermissionSystem.upsertGroups([
                {
                    _id: "group-public-content",
                    type: "group",
                    updatedTimeUtc: 3,
                    name: "Public Content",
                    acl: [
                        {
                            type: "post",
                            groupId: "group-public-editors",
                            permission: ["view", "edit", "translate", "publish"],
                        },
                        {
                            type: "tag",
                            groupId: "group-public-editors",
                            permission: ["view", "translate", "assign"],
                        },
                        {
                            type: "group",
                            groupId: "group-public-editors",
                            permission: ["view", "assign"],
                        },
                        {
                            type: "post",
                            groupId: "group-private-users",
                            permission: ["view"],
                        },
                        {
                            type: "tag",
                            groupId: "group-private-users",
                            permission: ["view"],
                        },
                    ],
                },
            ]);

            // Check if the removed ACL's group is not available anymore
            expect(
                PermissionSystem.verifyAccess(
                    ["group-public-content"],
                    DocType.Language,
                    AclPermission.View,
                    ["group-public-users"],
                ),
            ).toBe(false);
        });

        it("can add an ACL to an existing group", () => {
            PermissionSystem.upsertGroups([
                {
                    _id: "group-public-content",
                    type: "group",
                    updatedTimeUtc: 3,
                    name: "Public Content",
                    acl: [
                        {
                            type: "post",
                            groupId: "group-public-editors",
                            permission: ["view", "edit", "translate", "publish"],
                        },
                        {
                            type: "tag",
                            groupId: "group-public-editors",
                            permission: ["view", "translate", "assign"],
                        },
                        {
                            type: "group",
                            groupId: "group-public-editors",
                            permission: ["view", "assign"],
                        },
                        {
                            type: "post",
                            groupId: "group-private-users",
                            permission: ["view"],
                        },
                        {
                            type: "tag",
                            groupId: "group-private-users",
                            permission: ["view"],
                        },
                        ,
                        {
                            type: "post",
                            groupId: "group-public-users",
                            permission: ["view", "edit"],
                        },
                        {
                            type: "tag",
                            groupId: "group-public-users",
                            permission: ["view", "edit"],
                        },
                    ],
                },
            ]);

            expect(
                PermissionSystem.verifyAccess(
                    ["group-public-content"],
                    DocType.Post,
                    AclPermission.Edit,
                    ["group-public-users"],
                ),
            ).toBe(true);

            expect(
                PermissionSystem.verifyAccess(
                    ["group-public-content"],
                    DocType.Tag,
                    AclPermission.Edit,
                    ["group-public-users"],
                ),
            ).toBe(true);

            expect(
                PermissionSystem.verifyAccess(
                    ["group-public-content"],
                    DocType.Post,
                    AclPermission.View,
                    ["group-public-users"],
                ),
            ).toBe(true);

            expect(
                PermissionSystem.verifyAccess(
                    ["group-public-content"],
                    DocType.Tag,
                    AclPermission.View,
                    ["group-public-users"],
                ),
            ).toBe(true);
        });
    });
});
