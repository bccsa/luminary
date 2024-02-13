import { Test, TestingModule } from "@nestjs/testing";
import { DbService } from "../db/db.service";
import { Group } from "./permissions.service";
import { DocType, AclPermission } from "../enums";

describe("PermissionService", () => {
    let db: DbService;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [DbService],
        }).compile();

        db = module.get<DbService>(DbService);
        const res: any = await db.getGroups();
        Group.upsertGroups(res.docs);
    });

    it("can be instantiated", () => {
        expect(Group.upsertGroups).toBeDefined();
        expect(Group.removeGroups).toBeDefined();
        expect(Group.getAccess).toBeDefined();
    });

    it("can calculate inherited groups", () => {
        // group-super-admins is the top level group in the testing data set, and group-language the lowest level group.
        // Test if inheritance is replicated through the whole testing data set.
        const res = Group.getAccess(["group-super-admins"], [DocType.Language], AclPermission.View);

        expect(res.includes("group-languages")).toBe(true);
    });

    it("can update inherited groups", () => {
        // Use modified version of existing document in test data set and see if it successfully updates the permission system
        Group.upsertGroups([
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

        const res1 = Group.getAccess(
            ["group-private-content"],
            [DocType.Language],
            AclPermission.Translate,
        );
        const res2 = Group.getAccess(
            ["group-public-editors"],
            [DocType.Language],
            AclPermission.Translate,
        );

        expect(res1.includes("group-languages")).toBe(true);
        expect(res2.includes("group-languages")).toBe(false);
    });

    it("can remove a group", () => {
        Group.removeGroups(["group-languages"]);

        const res = Group.getAccess(
            ["group-super-admins"],
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
    });

    it("can remove an ACL", () => {
        // Update an existing document with less ACL entries
        Group.upsertGroups([
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

        const res = Group.getAccess(
            ["group-public-users"],
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
        Group.upsertGroups([
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

        const res1 = Group.getAccess(["group-public-users"], [DocType.Post], AclPermission.Edit);
        expect(res1.includes("group-public-content")).toBe(true);

        const res2 = Group.getAccess(["group-public-users"], [DocType.Tag], AclPermission.Edit);
        expect(res2.includes("group-public-content")).toBe(true);

        const res3 = Group.getAccess(["group-public-users"], [DocType.Post], AclPermission.View);
        expect(res3.includes("group-public-content")).toBe(true);

        const res4 = Group.getAccess(["group-public-users"], [DocType.Tag], AclPermission.View);
        expect(res4.includes("group-public-content")).toBe(true);
    });
});
