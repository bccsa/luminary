import { Test, TestingModule } from "@nestjs/testing";
import { DbService } from "../db/db.service";
import { PermissionSystem } from "./permissions.service";
import { DocType, AclPermission } from "../enums";
import { plainToClass } from "class-transformer";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { AccessMap } from "./AccessMap";

describe("PermissionService", () => {
    let db: DbService;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [DbService],
        }).compile();

        db = module.get<DbService>(DbService);
        const res: any = await db.getGroups();
        PermissionSystem.upsertGroups(res.docs);

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
        expect(PermissionSystem.getAccessMap).toBeDefined();
        expect(AccessMap).toBeDefined();
    });

    describe("Model tests", () => {
        it("can calculate inherited groups", () => {
            // group-super-admins is the top level group in the testing data set, and group-language the lowest level group.
            // Test if inheritance is replicated through the whole testing data set.
            const accessMap = PermissionSystem.getAccessMap(["group-super-admins"]);
            const res = accessMap.calculateAccess([DocType.Language], AclPermission.View);

            expect(res.includes("group-languages")).toBe(true);
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

            const accessMap1 = PermissionSystem.getAccessMap(["group-private-content"]);
            const res1 = accessMap1.calculateAccess([DocType.Language], AclPermission.Translate);

            const accessMap2 = PermissionSystem.getAccessMap(["group-public-editors"]);
            const res2 = accessMap2.calculateAccess([DocType.Language], AclPermission.Translate);

            expect(res1.includes("group-languages")).toBe(true);
            expect(res2.includes("group-languages")).toBe(false);
        });

        it("can remove a group", () => {
            PermissionSystem.removeGroups(["group-languages"]);

            const accessMap = PermissionSystem.getAccessMap(["group-super-admins"]);
            const res = accessMap.calculateAccess(
                [
                    // DocType.Audio,
                    DocType.Change,
                    DocType.Content,
                    DocType.Group,
                    // DocType.Image,
                    DocType.Language,
                    // DocType.MediaDownload,
                    DocType.Post,
                    DocType.Tag,
                    DocType.User,
                    // DocType.Video,
                ],
                AclPermission.View,
            );

            // Check if the (removed) inherited group is removed from the top level parent
            expect(res.includes("group-languages")).toBe(false);

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

            const accessMap = PermissionSystem.getAccessMap(["group-public-users"]);
            const res = accessMap.calculateAccess(
                [
                    // DocType.Audio,
                    DocType.Change,
                    DocType.Content,
                    DocType.Group,
                    // DocType.Image,
                    DocType.Language,
                    // DocType.MediaDownload,
                    DocType.Post,
                    DocType.Tag,
                    DocType.User,
                    // DocType.Video,
                ],
                AclPermission.View,
            );

            // Check if the removed ACL's group is not available anymore
            expect(res.includes("group-public-content")).toBe(false);
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

            const accessMap = PermissionSystem.getAccessMap(["group-public-users"]);

            const res1 = accessMap.calculateAccess([DocType.Post], AclPermission.Edit);
            expect(res1.includes("group-public-content")).toBe(true);

            const res2 = accessMap.calculateAccess([DocType.Tag], AclPermission.Edit);
            expect(res2.includes("group-public-content")).toBe(true);

            const res3 = accessMap.calculateAccess([DocType.Post], AclPermission.View);
            expect(res3.includes("group-public-content")).toBe(true);

            const res4 = accessMap.calculateAccess([DocType.Tag], AclPermission.View);
            expect(res4.includes("group-public-content")).toBe(true);
        });
    });
});
