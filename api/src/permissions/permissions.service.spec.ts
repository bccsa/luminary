import { PermissionSystem } from "./permissions.service";
import { DocType, AclPermission } from "../enums";
import { createTestingModule } from "../test/testingModule";
import waitForExpect from "wait-for-expect";
import { GroupDto } from "../dto/GroupDto";

describe("PermissionService", () => {
    let testingModule: any;

    beforeAll(async () => {
        testingModule = await createTestingModule("permission-service");

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

        it("returns the highest level of (inherited) permission for a given group if multiple group memberships are present", () => {
            const accessMap = PermissionSystem.getAccessMap([
                "group-public-users",
                "group-public-editors",
            ]);
            expect(accessMap).toBeDefined();
            expect(accessMap["group-public-content"][DocType.Post][AclPermission.View]).toBe(true);
            expect(accessMap["group-public-content"][DocType.Post][AclPermission.Edit]).toBe(true);
            expect(accessMap["group-public-content"][DocType.Post][AclPermission.Publish]).toBe(
                true,
            );

            // Check that the result is the same if the order of the groups is reversed
            const accessMap2 = PermissionSystem.getAccessMap([
                "group-public-editors",
                "group-public-users",
            ]);
            expect(accessMap2).toBeDefined();
            expect(accessMap2["group-public-content"][DocType.Post][AclPermission.View]).toBe(true);
            expect(accessMap2["group-public-content"][DocType.Post][AclPermission.Edit]).toBe(true);
            expect(accessMap2["group-public-content"][DocType.Post][AclPermission.Publish]).toBe(
                true,
            );
            expect(accessMap2).toEqual(accessMap);
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

        it("accessMapDiff: returns the first AccessMap if the second AccessMap is invalid", () => {
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

        it("can calculate downstream inherited groups", () => {
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

        it("can remove a single docType from an ACL entry", async () => {
            // Remove language access from group-super-admins and test if group-super-admins does not have edit access to group-languages anymore.
            // ----------------------------------------
            const groupDoc = (await testingModule.dbService.getDoc("group-super-admins")).docs[0];
            const languageAcls = groupDoc.acl.filter((acl) => acl.type === "language");
            groupDoc.acl = groupDoc.acl.filter((acl) => acl.type !== "language");
            PermissionSystem.upsertGroups([groupDoc]);

            await waitForExpect(() => {
                expect(
                    PermissionSystem.verifyAccess(
                        ["group-super-admins"],
                        DocType.Language,
                        AclPermission.Edit,
                        ["group-super-admins"],
                    ),
                ).toBe(false);
            });

            // Restore language access for further tests
            groupDoc.acl = groupDoc.acl.concat(languageAcls);
            PermissionSystem.upsertGroups([groupDoc]);

            await waitForExpect(() => {
                expect(
                    PermissionSystem.verifyAccess(
                        ["group-super-admins"],
                        DocType.Language,
                        AclPermission.Edit,
                        ["group-super-admins"],
                    ),
                ).toBe(true);
            });
        });

        it("can calculate upstream inherited groups for non-group documents", async () => {
            // Create a top-level group with only self-assigned view access to post documents.
            const groupDoc1: GroupDto = new GroupDto();
            groupDoc1._id = "group-test-top";
            groupDoc1.type = DocType.Group;
            groupDoc1.updatedTimeUtc = 3;
            groupDoc1.name = "Test Top Group";
            groupDoc1.acl = [
                {
                    type: DocType.Post,
                    groupId: "group-test-top",
                    permission: [AclPermission.View],
                },
            ];
            PermissionSystem.upsertGroups([groupDoc1]);

            // Create a middle level group, and give group-test-top only view access to post documents on it.
            const groupDoc2: GroupDto = new GroupDto();
            groupDoc2._id = "group-test-middle";
            groupDoc2.type = DocType.Group;
            groupDoc2.updatedTimeUtc = 3;
            groupDoc2.name = "Test Middle Group";
            groupDoc2.acl = [
                {
                    type: DocType.Post,
                    groupId: "group-test-top",
                    permission: [AclPermission.View],
                },
            ];
            PermissionSystem.upsertGroups([groupDoc2]);

            expect(
                PermissionSystem.verifyAccess(
                    ["group-test-middle"],
                    DocType.Post,
                    AclPermission.View,
                    ["group-test-top"],
                ),
            ).toBe(true);

            // Create a lower level group, and give group-test-middle language document edit access to it.
            const groupDoc3: GroupDto = new GroupDto();
            groupDoc3._id = "group-test-low";
            groupDoc3.type = DocType.Group;
            groupDoc3.updatedTimeUtc = 3;
            groupDoc3.name = "Test Lower Group";
            groupDoc3.acl = [
                {
                    type: DocType.Language,
                    groupId: "group-test-middle",
                    permission: [AclPermission.View, AclPermission.Edit],
                },
            ];
            PermissionSystem.upsertGroups([groupDoc3]);

            // Both group-test-top and group-test-middle should have edit access to group-test-low
            expect(
                PermissionSystem.verifyAccess(
                    ["group-test-low"],
                    DocType.Language,
                    AclPermission.Edit,
                    ["group-test-top"],
                ),
            ).toBe(true);
            expect(
                PermissionSystem.verifyAccess(
                    ["group-test-low"],
                    DocType.Language,
                    AclPermission.Edit,
                    ["group-test-middle"],
                ),
            ).toBe(true);

            // Add and remove language edit access to the top level group,
            // and check if the top level group still has language edit access to the low level group
            const groupDoc1a = {
                ...groupDoc1,
                acl: [
                    {
                        type: DocType.Post,
                        groupId: "group-test-top",
                        permission: [AclPermission.View],
                    },
                    {
                        type: DocType.Language,
                        groupId: "group-test-top",
                        permission: [AclPermission.View, AclPermission.Edit],
                    },
                ],
            };
            PermissionSystem.upsertGroups([groupDoc1a]);
            PermissionSystem.upsertGroups([groupDoc1]);

            expect(
                PermissionSystem.verifyAccess(
                    ["group-test-low"],
                    DocType.Language,
                    AclPermission.Edit,
                    ["group-test-top"],
                ),
            ).toBe(true);

            // Remove the test groups for further tests
            PermissionSystem.removeGroups([
                "group-test-top",
                "group-test-middle",
                "group-test-low",
            ]);
        });

        it("can update downstream groups", () => {
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

        it("can apply self-assigned permissions", () => {
            // Create a group hierarchy with 4 levels, and give the top level group view access to post documents.
            const groupDoc1: GroupDto = new GroupDto();
            groupDoc1._id = "group-test-top";
            groupDoc1.type = DocType.Group;
            groupDoc1.updatedTimeUtc = 3;
            groupDoc1.name = "Test Top Group";
            groupDoc1.acl = [
                {
                    type: DocType.Post,
                    groupId: "group-test-top",
                    permission: [AclPermission.View, AclPermission.Edit],
                },
            ];

            const groupDoc2: GroupDto = new GroupDto();
            groupDoc2._id = "group-test-middle";
            groupDoc2.type = DocType.Group;
            groupDoc2.updatedTimeUtc = 3;
            groupDoc2.name = "Test Middle Group";
            groupDoc2.acl = [
                {
                    type: DocType.Post,
                    groupId: "group-test-top",
                    permission: [AclPermission.View],
                },
            ];

            const groupDoc3: GroupDto = new GroupDto();
            groupDoc3._id = "group-test-low";
            groupDoc3.type = DocType.Group;
            groupDoc3.updatedTimeUtc = 3;
            groupDoc3.name = "Test Lower Group";
            groupDoc3.acl = [
                {
                    type: DocType.Post,
                    groupId: "group-test-middle",
                    permission: [AclPermission.View],
                },
            ];

            const groupDoc4: GroupDto = new GroupDto();
            groupDoc4._id = "group-test-bottom";
            groupDoc4.type = DocType.Group;
            groupDoc4.updatedTimeUtc = 3;
            groupDoc4.name = "Test Bottom Group";
            groupDoc4.acl = [
                {
                    type: DocType.Post,
                    groupId: "group-test-low",
                    permission: [AclPermission.View],
                },
            ];

            PermissionSystem.upsertGroups([groupDoc1, groupDoc2, groupDoc3, groupDoc4]);

            // Check if the top level group has edit access to the bottom level group
            expect(
                PermissionSystem.verifyAccess(
                    ["group-test-bottom"],
                    DocType.Post,
                    AclPermission.Edit,
                    ["group-test-top"],
                ),
            ).toBe(true);

            // Remove edit access from the top level group and check if the bottom level group does not have edit access anymore
            groupDoc1.acl[0].permission = [AclPermission.View];
            PermissionSystem.upsertGroups([groupDoc1]);

            expect(
                PermissionSystem.verifyAccess(
                    ["group-test-bottom"],
                    DocType.Post,
                    AclPermission.Edit,
                    ["group-test-top"],
                ),
            ).toBe(false);

            // Remove the test groups for further tests
            PermissionSystem.removeGroups([
                "group-test-top",
                "group-test-middle",
                "group-test-low",
                "group-test-bottom",
            ]);
        });

        it("can correctly apply multi-path upstream inheritance", () => {
            // Create a hierarchy with one top-level group, one middle-level group, two lower-level groups, and one bottom-level group.

            // Top level group
            const groupDoc1: GroupDto = new GroupDto();
            groupDoc1._id = "group-test-top";
            groupDoc1.type = DocType.Group;
            groupDoc1.updatedTimeUtc = 3;
            groupDoc1.name = "Test Top Group";
            groupDoc1.acl = [
                {
                    type: DocType.Post,
                    groupId: "group-test-top",
                    permission: [AclPermission.View],
                },
            ];

            // Middle level group
            const groupDoc2: GroupDto = new GroupDto();
            groupDoc2._id = "group-test-middle";
            groupDoc2.type = DocType.Group;
            groupDoc2.updatedTimeUtc = 3;
            groupDoc2.name = "Test Middle Group";
            groupDoc2.acl = [
                {
                    type: DocType.Post,
                    groupId: "group-test-top",
                    permission: [AclPermission.View],
                },
            ];

            // Lower level groups
            const groupDoc3: GroupDto = new GroupDto();
            groupDoc3._id = "group-test-low1";
            groupDoc3.type = DocType.Group;
            groupDoc3.updatedTimeUtc = 3;
            groupDoc3.name = "Test Lower Group 1";
            groupDoc3.acl = [
                {
                    type: DocType.Post,
                    groupId: "group-test-middle",
                    permission: [AclPermission.View],
                },
            ];

            const groupDoc4: GroupDto = new GroupDto();
            groupDoc4._id = "group-test-low2";
            groupDoc4.type = DocType.Group;
            groupDoc4.updatedTimeUtc = 3;
            groupDoc4.name = "Test Lower Group 2";
            groupDoc4.acl = [
                {
                    type: DocType.Post,
                    groupId: "group-test-middle",
                    permission: [AclPermission.View],
                },
            ];

            // Bottom level group
            const groupDoc5: GroupDto = new GroupDto();
            groupDoc5._id = "group-test-bottom";
            groupDoc5.type = DocType.Group;
            groupDoc5.updatedTimeUtc = 3;
            groupDoc5.name = "Test Bottom Group";
            groupDoc5.acl = [
                {
                    type: DocType.Post,
                    groupId: "group-test-low1",
                    permission: [AclPermission.View],
                },
                {
                    type: DocType.Post,
                    groupId: "group-test-low2",
                    permission: [AclPermission.View, AclPermission.Edit],
                },
            ];

            PermissionSystem.upsertGroups([groupDoc1, groupDoc2, groupDoc3, groupDoc4, groupDoc5]);

            // Check if the top level group has Edit access to the bottom level group
            expect(
                PermissionSystem.verifyAccess(
                    ["group-test-bottom"],
                    DocType.Post,
                    AclPermission.Edit,
                    ["group-test-top"],
                ),
            ).toBe(true);

            // Remove Edit access from the bottom level group's ACL entry for group-test-low2, and check if the top level group does not have Edit access anymore
            groupDoc5.acl[1].permission = [AclPermission.View];
            PermissionSystem.upsertGroups([groupDoc5]);

            expect(
                PermissionSystem.verifyAccess(
                    ["group-test-bottom"],
                    DocType.Post,
                    AclPermission.Edit,
                    ["group-test-top"],
                ),
            ).toBe(false);

            // Remove the test groups for further tests
            PermissionSystem.removeGroups([
                "group-test-top",
                "group-test-middle",
                "group-test-low1",
                "group-test-low2",
                "group-test-bottom",
            ]);
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

        it("can self-assign permissions to a group if the user has edit access to the group", () => {
            // See issue #257
            PermissionSystem.upsertGroups([
                {
                    _id: "test-self-assign",
                    type: "group",
                    updatedTimeUtc: 3,
                    name: "Test Self Assign",
                    acl: [
                        {
                            type: "group",
                            groupId: "test-self-assign",
                            permission: ["view", "edit"],
                        },
                    ],
                },
            ]);

            expect(
                PermissionSystem.verifyAccess(
                    ["test-self-assign"],
                    DocType.Group,
                    AclPermission.Assign,
                    ["test-self-assign"],
                ),
            ).toBe(true);

            PermissionSystem.upsertGroups([
                {
                    _id: "test-self-assign",
                    type: "group",
                    updatedTimeUtc: 3,
                    name: "Test Self Assign",
                    acl: [
                        {
                            type: "group",
                            groupId: "test-self-assign",
                            permission: ["view"],
                        },
                    ],
                },
            ]);

            expect(
                PermissionSystem.verifyAccess(
                    ["test-self-assign"],
                    DocType.Group,
                    AclPermission.Assign,
                    ["test-self-assign"],
                ),
            ).toBe(false);
        });

        it("does not break when a circular reference is created", () => {
            // Create three groups with circular references
            const groupDoc1: GroupDto = new GroupDto();
            groupDoc1._id = "group-test1";
            groupDoc1.type = DocType.Group;
            groupDoc1.updatedTimeUtc = 3;
            groupDoc1.name = "Test Group 1";
            groupDoc1.acl = [
                {
                    type: DocType.Group,
                    groupId: "group-test2",
                    permission: [AclPermission.View],
                },
            ];

            const groupDoc2: GroupDto = new GroupDto();
            groupDoc2._id = "group-test2";
            groupDoc2.type = DocType.Group;
            groupDoc2.updatedTimeUtc = 3;
            groupDoc2.name = "Test Group 2";
            groupDoc2.acl = [
                {
                    type: DocType.Group,
                    groupId: "group-test3",
                    permission: [AclPermission.View],
                },
            ];

            const groupDoc3: GroupDto = new GroupDto();
            groupDoc3._id = "group-test3";
            groupDoc3.type = DocType.Group;
            groupDoc3.updatedTimeUtc = 3;
            groupDoc3.name = "Test Group 3";
            groupDoc3.acl = [
                {
                    type: DocType.Group,
                    groupId: "group-test1",
                    permission: [AclPermission.View],
                },
            ];

            PermissionSystem.upsertGroups([groupDoc1, groupDoc2, groupDoc3]);

            // If we are getting this far, the system did not break with a stack overflow error
        });
    });

    describe("Database integration tests", () => {
        it("can upsert a group from the db change feed", async () => {
            await testingModule.dbService.upsertDoc({
                _id: "test-group",
                type: "group",
                name: "Test Group",
                acl: [
                    {
                        type: "language",
                        groupId: "group-public-content",
                        permission: ["view"],
                    },
                ],
            });

            await waitForExpect(() => {
                const res = PermissionSystem.getAccessibleGroups(
                    [DocType.Language],
                    AclPermission.View,
                    ["group-public-content"],
                );

                expect(res[DocType.Language].includes("test-group")).toBe(true);
            });
        });
    });
});
