import { Test, TestingModule } from "@nestjs/testing";
import { DbService } from "../db/db.service";
import { Group } from "./permissions.service";

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
        const res: Map<string, Map<string, Map<string, boolean>>> = Group.getAccess(
            ["group-super-admins"],
            groupMap,
        );

        expect(res["group-languages"]["language"]["view"]).toBe(true);
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

        const res1: Map<string, Map<string, Map<string, boolean>>> = Group.getAccess(
            ["group-private-content"],
            groupMap,
        );
        const res2: Map<string, Map<string, Map<string, boolean>>> = Group.getAccess(
            ["group-public-editors"],
            groupMap,
        );

        expect(res1["group-languages"]["language"]["translate"]).toBe(true);
        expect(res2["group-languages"]["language"]["translate"]).toBe(undefined);
    });

    it("can remove a group", () => {
        Group.removeGroups(["group-languages"], groupMap);

        const res: Map<string, Map<string, Map<string, boolean>>> = Group.getAccess(
            ["group-super-admins"],
            groupMap,
        );

        expect(res["group-languages"]).toBe(undefined);
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

        const res: Map<string, Map<string, Map<string, boolean>>> = Group.getAccess(
            ["group-public-users"],
            groupMap,
        );

        expect(res["group-public-content"]).toBe(undefined);
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

        console.log(groupMap);

        const res: Map<string, Map<string, Map<string, boolean>>> = Group.getAccess(
            ["group-public-users"],
            groupMap,
        );

        console.log(res);

        expect(res["group-public-content"].post.edit).toBe(true);
        expect(res["group-public-content"].tag.edit).toBe(true);
        expect(res["group-public-content"].post.view).toBe(true);
        expect(res["group-public-content"].tag.view).toBe(true);
    });
});
