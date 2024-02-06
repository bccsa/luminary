import { Test, TestingModule } from "@nestjs/testing";
import { DbService } from "../db/db.service";
import { AclPermission, DocType, Group } from "./permissions.service";

describe("PermissionService", () => {
    let db: DbService;
    const groupMap = new Map<string, Group>();

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [DbService],
        }).compile();

        db = module.get<DbService>(DbService);
        const res: any = await db.getGroups();
        Group.updateGroups(res.docs, groupMap);
    });

    it("can be instantiated", () => {
        expect(Group.updateGroups).toBeDefined();
        expect(Group.removeGroups).toBeDefined();
        expect(Group.getAccess).toBeDefined();
    });

    it("can create a Group Map", () => {
        expect(Object.keys(groupMap).length).toBe(8);
    });

    it("can calculate inherited groups", () => {
        const res = Group.getAccess(
            ["group-super-admins"],
            groupMap,
            [DocType.Language],
            AclPermission.View,
        );

        expect(res.includes("group-languages")).toBe(true);
    });

    it("can update inherited groups", () => {
        Group.updateGroups(
            [
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
            ],
            groupMap,
        );

        const res1 = Group.getAccess(
            ["group-private-content"],
            groupMap,
            [DocType.Language],
            AclPermission.Translate,
        );
        const res2 = Group.getAccess(
            ["group-public-editors"],
            groupMap,
            [DocType.Language],
            AclPermission.Translate,
        );

        expect(res1.includes("group-languages")).toBe(true);
        expect(res2.includes("group-languages")).toBe(false);
    });

    it("can remove a group", () => {
        Group.removeGroups(["group-languages"], groupMap);

        const res = Group.getAccess(
            ["group-super-admins"],
            groupMap,
            [
                DocType.Audio,
                DocType.Change,
                DocType.Content,
                DocType.Group,
                DocType.Image,
                DocType.Language,
                DocType.MediaDownload,
                DocType.Post,
                DocType.Tag,
                DocType.User,
                DocType.Video,
            ],
            AclPermission.View,
        );

        expect(res.includes("group-languages")).toBe(false);
    });

    it("can remove an ACL", () => {
        Group.updateGroups(
            [
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
            ],
            groupMap,
        );

        const res = Group.getAccess(
            ["group-public-users"],
            groupMap,
            [
                DocType.Audio,
                DocType.Change,
                DocType.Content,
                DocType.Group,
                DocType.Image,
                DocType.Language,
                DocType.MediaDownload,
                DocType.Post,
                DocType.Tag,
                DocType.User,
                DocType.Video,
            ],
            AclPermission.View,
        );

        expect(res.includes("group-public-content")).toBe(false);
    });

    it("can add an ACL to an existing group", () => {
        Group.updateGroups(
            [
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
            ],
            groupMap,
        );

        const res1 = Group.getAccess(
            ["group-public-users"],
            groupMap,
            [DocType.Post],
            AclPermission.Edit,
        );
        expect(res1.includes("group-public-content")).toBe(true);

        const res2 = Group.getAccess(
            ["group-public-users"],
            groupMap,
            [DocType.Tag],
            AclPermission.Edit,
        );
        expect(res2.includes("group-public-content")).toBe(true);

        const res3 = Group.getAccess(
            ["group-public-users"],
            groupMap,
            [DocType.Post],
            AclPermission.View,
        );
        expect(res3.includes("group-public-content")).toBe(true);

        const res4 = Group.getAccess(
            ["group-public-users"],
            groupMap,
            [DocType.Tag],
            AclPermission.View,
        );
        expect(res4.includes("group-public-content")).toBe(true);
    });
});
