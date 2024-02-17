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

    describe("Validation tests", () => {
        const testChangeReq_group = plainToClass(ChangeReqDto, {
            reqId: "test change request",
            type: DocType.ChangeReq,
            doc: {
                _id: "group-languages",
                type: "group",
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
                        permission: ["view"],
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
        });

        describe("Group documents", () => {
            it("higher level group with edit access can pass validation", async () => {
                const accessMap = PermissionSystem.getAccessMap(["group-super-admins"]);
                const res = await PermissionSystem.validateChangeRequest(
                    testChangeReq_group,
                    accessMap,
                    db,
                );
                expect(res).toBe(""); // empty string means validation passed
            });

            it("group with no access can NOT pass validation ", async () => {
                const accessMap = PermissionSystem.getAccessMap(["group-private-editors"]);
                const res = await PermissionSystem.validateChangeRequest(
                    testChangeReq_group,
                    accessMap,
                    db,
                );
                expect(res).toBe("No access to 'Edit' document type 'Group'"); // empty string means validation passed
            });

            it("can not assign a group to another group's ACL without 'Assign' access to the second group", async () => {
                const testChangeReq_groupAcl = plainToClass(ChangeReqDto, {
                    reqId: "test change request",
                    type: DocType.ChangeReq,
                    doc: {
                        _id: "group-languages",
                        type: "group",
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
                                permission: ["view"],
                            },
                            {
                                type: "language",
                                groupId: "group-public-editors",
                                permission: ["view", "translate"],
                            },
                            {
                                type: "language",
                                groupId: "invalid-group",
                                permission: ["view", "translate"],
                            },
                        ],
                    },
                });

                const accessMap = PermissionSystem.getAccessMap(["group-super-admins"]);
                const res = await PermissionSystem.validateChangeRequest(
                    testChangeReq_groupAcl,
                    accessMap,
                    db,
                );
                expect(res).toBe("No access to 'Assign' one or more groups to the group ACL"); // empty string means validation passed
            });
        });

        describe("Content documents", () => {
            const testChangeReq_Content = plainToClass(ChangeReqDto, {
                reqId: "test change request",
                type: DocType.ChangeReq,
                doc: {
                    _id: "content-post2-eng",
                    type: "content",
                    memberOf: ["group-private-content"],
                    language: "lang-eng",
                    status: "published",
                    slug: "post2-eng",
                    title: "Post 2",
                    summary: "This is an example post",
                    author: "ChatGPT",
                    text: "When young Oliver moved from the bustling city to a quiet town in a distant country, he felt lost and lonely. The language was different, the streets unfamiliar, and the faces foreign. However, fate had a heartwarming surprise in store for him. One sunny afternoon, while exploring the cobblestone lanes, Oliver spotted a group of kids playing soccer in a makeshift field. Hesitant but eager for connection, he approached them.\n\nTo his delight, a boy named Luca greeted him with a warm smile, effortlessly bridging the gap between their worlds. Though their languages differed, the universal joy of childhood transcended any barriers. Luca became Oliver's guide to the town, showing him secret hideouts, sharing local treats, and teaching him phrases in their shared laughter-filled language.\n\nIn the simplicity of friendship, Oliver found a new home. Together, they navigated the charming town, creating memories that painted the canvas of Oliver's new life. The small town, once foreign, now echoed with the laughter of two friends who proved that no matter where you are, the warmth of companionship can turn unfamiliarity into the sweet melody of belonging.",
                    seo: "",
                    localisedImage: "",
                    audio: "",
                    video: "",
                    publishDate: 3,
                    expiryDate: 0,
                },
            });

            it("can validate: general test should pass all validations", async () => {
                const accessMap = PermissionSystem.getAccessMap(["group-private-editors"]);
                const res = await PermissionSystem.validateChangeRequest(
                    testChangeReq_Content,
                    accessMap,
                    db,
                );

                expect(res).toBe(""); // empty string means validation passed
            });

            it("ccan validate: No access to 'Translate' document", async () => {
                // Test if another group does not have translate access to the Content document
                const accessMap = PermissionSystem.getAccessMap(["group-public-editors"]);
                const res = await PermissionSystem.validateChangeRequest(
                    testChangeReq_Content,
                    accessMap,
                    db,
                );
                expect(res).toBe("No access to 'Translate' document"); // empty string means validation passed
            });

            it("can validate: No 'Translate' access to the language of the Content object", async () => {
                // Add a test group to the ACL of the Content document and only give access to the Content document's group (and not to the language group)
                PermissionSystem.upsertGroups([
                    {
                        _id: "group-test-language-translate-access",
                        type: "group",
                        name: "Test language translate access",
                        acl: [],
                    },
                    {
                        _id: "group-private-content",
                        type: "group",
                        name: "Private Content",
                        acl: [
                            {
                                type: "post",
                                groupId: "group-test-language-translate-access",
                                permission: ["view", "edit", "translate"],
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
                            {
                                type: "post",
                                groupId: "group-private-editors",
                                permission: ["view", "edit", "translate", "publish"],
                            },
                            {
                                type: "tag",
                                groupId: "group-private-editors",
                                permission: ["view", "translate", "assign"],
                            },
                            {
                                type: "group",
                                groupId: "group-private-editors",
                                permission: ["view", "assign"],
                            },
                        ],
                    },
                ]);
                const accessMap = PermissionSystem.getAccessMap([
                    "group-test-language-translate-access",
                ]);
                const res = await PermissionSystem.validateChangeRequest(
                    testChangeReq_Content,
                    accessMap,
                    db,
                );
                expect(res).toBe("No 'Translate' access to the language of the Content object"); // empty string means validation passed
            });

            it("can validate: No 'Publish' access to document type 'Content'", async () => {
                // Add permission to access the language of the Content document to run the next test
                PermissionSystem.upsertGroups([
                    {
                        _id: "group-languages",
                        type: "group",
                        name: "Languages",
                        acl: [
                            {
                                type: "language",
                                groupId: "group-test-language-translate-access",
                                permission: ["view", "translate"],
                            },
                            {
                                type: "language",
                                groupId: "group-public-content",
                                permission: ["view"],
                            },
                            {
                                type: "language",
                                groupId: "group-private-content",
                                permission: ["view"],
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

                const accessMap = PermissionSystem.getAccessMap([
                    "group-test-language-translate-access",
                ]);
                const res = await PermissionSystem.validateChangeRequest(
                    testChangeReq_Content,
                    accessMap,
                    db,
                );
                expect(res).toBe("No 'Publish' access to document type 'Content'"); // empty string means validation passed
            });
        });

        describe("Generic documents", () => {
            const testChangeReq_Post = plainToClass(ChangeReqDto, {
                reqId: "test change request",
                type: DocType.ChangeReq,
                doc: {
                    _id: "post-post2",
                    type: "post",
                    memberOf: ["group-private-content"],
                    content: ["content-post2-eng", "content-post2-fra"],
                    image: "",
                    tags: ["tag-category2", "tag-topicB"],
                },
            });

            it("can validate: general test should pass all validations", async () => {
                const accessMap = PermissionSystem.getAccessMap(["group-private-editors"]);
                const res = await PermissionSystem.validateChangeRequest(
                    testChangeReq_Post,
                    accessMap,
                    db,
                );
                expect(res).toBe(""); // empty string means validation passed
            });

            it("can validate: No 'Edit' access to one or more groups", async () => {
                const accessMap = PermissionSystem.getAccessMap(["group-private-users"]);
                const res = await PermissionSystem.validateChangeRequest(
                    testChangeReq_Post,
                    accessMap,
                    db,
                );
                expect(res).toBe("No 'Edit' access to one or more groups"); // empty string means validation passed
            });

            it("can reject a document without group membership", async () => {
                const testChangeReq_noGroup = plainToClass(ChangeReqDto, {
                    reqId: "test change request",
                    type: DocType.ChangeReq,
                    doc: {
                        _id: "post-post2",
                        type: "post",
                        memberOf: [],
                        content: ["content-post2-eng", "content-post2-fra"],
                        image: "",
                        tags: ["tag-category2", "tag-topicB"],
                    },
                });

                const accessMap = PermissionSystem.getAccessMap(["group-private-editors"]);
                const res = await PermissionSystem.validateChangeRequest(
                    testChangeReq_noGroup,
                    accessMap,
                    db,
                );
                expect(res).toBe(
                    "Unable to verify access. The document is not a group or does not have group membership",
                ); // empty string means validation passed
            });
        });

        describe("Tag assign access", () => {
            it("can validate: No 'Assign' access to one or more tags", async () => {
                // Remove tag assign access from the group
                PermissionSystem.upsertGroups([
                    {
                        _id: "group-private-content",
                        type: "group",
                        name: "Private Content",
                        acl: [
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
                            {
                                type: "post",
                                groupId: "group-private-editors",
                                permission: ["view", "edit", "translate", "publish"],
                            },
                            {
                                type: "tag",
                                groupId: "group-private-editors",
                                permission: ["view", "translate"],
                            },
                            {
                                type: "group",
                                groupId: "group-private-editors",
                                permission: ["view", "assign"],
                            },
                        ],
                    },
                ]);

                const testChangeReq_Tag = plainToClass(ChangeReqDto, {
                    reqId: "test change request",
                    type: DocType.ChangeReq,
                    doc: {
                        _id: "post-post2",
                        type: "post",
                        memberOf: ["group-private-content"],
                        content: ["content-post2-eng", "content-post2-fra"],
                        image: "",
                        tags: ["tag-category2", "tag-topicB"],
                    },
                });

                const accessMap = PermissionSystem.getAccessMap(["group-private-editors"]);
                const res = await PermissionSystem.validateChangeRequest(
                    testChangeReq_Tag,
                    accessMap,
                    db,
                );
                expect(res).toBe("No 'Assign' access to one or more tags"); // empty string means validation passed
            });
        });
    });
});
