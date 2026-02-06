import "reflect-metadata";
import { DbService } from "../db/db.service";
import { PermissionSystem } from "../permissions/permissions.service";
import { plainToClass } from "class-transformer";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { validateChangeRequestAccess } from "./validateChangeRequestAccess";
import { createTestingModule } from "../test/testingModule";
import * as _ from "lodash";

describe("validateChangeRequestAccess", () => {
    let db: DbService;

    beforeAll(async () => {
        db = (await createTestingModule("validate-change-request-access")).dbService;

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

    const testChangeReq_group = plainToClass(ChangeReqDto, {

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

    describe("Invalid documents", () => {
        it("can reject a Change document", async () => {
            const testChangeReq_change = plainToClass(ChangeReqDto, {
                doc: {
                    _id: "change-123",
                    type: "change",
                    name: "Change 123",
                },
            });

            const res = await validateChangeRequestAccess(
                testChangeReq_change,
                ["group-super-admins"],
                db,
            );
            expect(res.error).toBe("Invalid document type - cannot submit Change documents");
        });

        it("can reject a document type change", async () => {
            const testChangeReq_change = plainToClass(ChangeReqDto, {
                doc: {
                    _id: "lang-eng",
                    type: "post",
                },
            });

            const res = await validateChangeRequestAccess(
                testChangeReq_change,
                ["group-super-admins"],
                db,
            );
            expect(res.error).toBe("Document type change not allowed");
        });
    });

    describe("Delete requests", () => {
        it("can reject a delete request if the user does not have delete access to the document", async () => {
            const testChangeReq_delete = plainToClass(ChangeReqDto, {
                doc: {
                    _id: "group-languages",
                    type: "group",
                    deleteReq: 1,
                },
            });

            const res = await validateChangeRequestAccess(
                testChangeReq_delete,
                ["group-private-editors"],
                db,
            );
            expect(res.error).toBe("No 'Delete' access to document");
        });

        it("can reject a delete request if the user does not have translate access to one of the associated content documents of a post or tag", async () => {
            // Change the memberOf of lang-french to a group that group-public-editors does not have translate access to
            const french = await db.getDoc("lang-fra");
            await db.upsertDoc({ ...french.docs[0], memberOf: ["group-super-admins"] });

            const testChangeReq_delete = plainToClass(ChangeReqDto, {
                doc: {
                    _id: "post-blog2",
                    type: "post",
                    deleteReq: 1,
                    memberOf: ["group-private-content"],
                },
            });

            const res = await validateChangeRequestAccess(
                testChangeReq_delete,
                ["group-private-editors"],
                db,
            );

            // Restore document for further tests
            await db.upsertDoc(french.docs[0]);

            expect(res.error).toBe(
                "Unable to delete post: No 'Translate' access to one or more associated content documents",
            );
        });
    });

    describe("Group documents", () => {
        it("higher level group with edit access can pass validation", async () => {
            const res = await validateChangeRequestAccess(
                testChangeReq_group,
                ["group-super-admins"],
                db,
            );
            expect(res.validated).toBe(true);
        });

        it("group with no access can NOT pass validation ", async () => {
            const res = await validateChangeRequestAccess(
                testChangeReq_group,
                ["group-private-editors"],
                db,
            );
            expect(res.error).toBe("No access to 'Edit' document type 'Group'");
        });

        it("can not assign an existing group to another group's ACL without 'Assign' access to the second group", async () => {
            const testChangeReq_groupAcl = plainToClass(ChangeReqDto, {
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

            const res = await validateChangeRequestAccess(
                testChangeReq_groupAcl,
                ["group-super-admins"],
                db,
            );
            expect(res.error).toBe("No access to 'Assign' one or more groups to the group ACL");
        });

        it("can not assign a new group to another group's ACL without 'Assign' access to the second group", async () => {
            const testChangeReq_groupAcl = plainToClass(ChangeReqDto, {
                doc: {
                    _id: "test-new-group-languages",
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

            const res = await validateChangeRequestAccess(
                testChangeReq_groupAcl,
                ["group-super-admins"],
                db,
            );
            expect(res.error).toBe("No access to 'Assign' one or more groups to the group ACL");
        });

        it("can not create a new group without 'Edit' access to at least one group in the ACL", async () => {
            const testChangeReq_newGroup = plainToClass(ChangeReqDto, {
                doc: {
                    _id: "new-group",
                    type: "group",
                    acl: [
                        {
                            type: "language",
                            groupId: "group-languages",
                            permission: ["view", "publish", "edit"],
                        },
                    ],
                    name: "new group",
                },
            });

            const res = await validateChangeRequestAccess(
                testChangeReq_newGroup,
                ["group-private-editors"],
                db,
            );
            expect(res.error).toBe("No access to create a new document type 'Group'");
        });
    });

    describe("Content documents", () => {
        const testChangeReq_Content = plainToClass(ChangeReqDto, {
            doc: {
                _id: "content-blog2-eng",
                type: "content",
                memberOf: ["group-private-content"],
                parentId: "post-blog2",
                language: "lang-eng",
                status: "published",
                slug: "blog2-eng",
                title: "Blog 2",
                summary: "This is an example blog",
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
            const res = await validateChangeRequestAccess(
                testChangeReq_Content,
                ["group-private-editors"],
                db,
            );

            expect(res.validated).toBe(true);
        });

        it("can validate: No access to 'Translate' document", async () => {
            // Test if another group does not have translate access to the Content document
            const res = await validateChangeRequestAccess(
                testChangeReq_Content,
                ["group-public-editors"],
                db,
            );
            expect(res.error).toBe("No access to 'Translate' document");
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

            const res = await validateChangeRequestAccess(
                testChangeReq_Content,
                ["group-test-language-translate-access"],
                db,
            );
            expect(res.error).toBe("No 'Translate' access to the language of the Content object");
        });

        it("can validate: No 'Publish' access to an existing document of type 'Content'", async () => {
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

            const res = await validateChangeRequestAccess(
                testChangeReq_Content,
                ["group-test-language-translate-access"],
                db,
            );
            expect(res.error).toBe("No 'Publish' access to document type 'Content'");
        });

        it("can validate: No 'Publish' access to a new document of type 'Content'", async () => {
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

            const changeReq = _.cloneDeep(testChangeReq_Content);
            changeReq.doc._id = "test-new-content-doc";

            const res = await validateChangeRequestAccess(
                changeReq,
                ["group-test-language-translate-access"],
                db,
            );
            expect(res.error).toBe("No 'Publish' access to document type 'Content'");
        });

        it("can reject a document with an invalid language", async () => {
            const testChangeReq_invalidLanguage = plainToClass(ChangeReqDto, {
                doc: {
                    _id: "content-blog2-eng",
                    type: "content",
                    memberOf: ["group-private-content"],
                    parentId: "post-blog2",
                    language: "invalid-lang",
                    status: "published",
                    slug: "blog2-eng",
                    title: "Blog 2",
                    summary: "This is an example blog",
                    author: "",
                    text: "",
                    seo: "",
                    localisedImage: "",
                    audio: "",
                    video: "",
                    publishDate: 3,
                    expiryDate: 0,
                },
            });

            const res = await validateChangeRequestAccess(
                testChangeReq_invalidLanguage,
                ["group-private-editors"],
                db,
            );
            expect(res.error).toBe("Language document not found");
        });
    });

    describe("Generic documents", () => {
        const testChangeReq_Post = plainToClass(ChangeReqDto, {
            doc: {
                _id: "post-blog2",
                type: "post",
                memberOf: ["group-private-content"],
                content: ["content-blog2-eng", "content-blog2-fra"],
                image: "",
                tags: ["tag-category2", "tag-topicB"],
                postType: "blog",
            },
        });

        it("can validate: general test should pass all validations", async () => {
            const res = await validateChangeRequestAccess(
                testChangeReq_Post,
                ["group-private-editors"],
                db,
            );
            expect(res.validated).toBe(true);
        });

        it("can validate: No 'Edit' access to document", async () => {
            const res = await validateChangeRequestAccess(
                testChangeReq_Post,
                ["group-private-users"],
                db,
            );
            expect(res.error).toBe("No 'Edit' access to document");
        });

        it("can reject a new document without group membership", async () => {
            const testChangeReq_noGroup = plainToClass(ChangeReqDto, {
                doc: {
                    _id: "test-new-post-123",
                    type: "post",
                    memberOf: [],
                    content: ["content-post2-eng", "content-post2-fra"],
                    image: "",
                    tags: ["tag-category2", "tag-topicB"],
                },
            });

            const res = await validateChangeRequestAccess(
                testChangeReq_noGroup,
                ["group-private-editors"],
                db,
            );
            expect(res.error).toBe("The document is not a group or does not have group membership");
        });

        it("can reject an existing document without group membership", async () => {
            const testChangeReq_noGroup = plainToClass(ChangeReqDto, {
                doc: {
                    _id: "post-blog2",
                    type: "post",
                    memberOf: [],
                    content: ["content-post2-eng", "content-post2-fra"],
                    image: "",
                    tags: ["tag-category2", "tag-topicB"],
                },
            });

            const res = await validateChangeRequestAccess(
                testChangeReq_noGroup,
                ["group-private-editors"],
                db,
            );
            expect(res.error).toBe("The document is not a group or does not have group membership");
        });

        it("can reject an update to an existing document when a group is added to the memberOf array to which the user does not have 'Assign' access", async () => {
            const testChangeReq_noAssign = plainToClass(ChangeReqDto, {
                doc: {
                    _id: "post-blog2",
                    type: "post",
                    memberOf: ["group-private-content", "group-private-users"],
                },
            });

            const res = await validateChangeRequestAccess(
                testChangeReq_noAssign,
                ["group-private-editors"],
                db,
            );
            expect(res.error).toBe("No 'Assign' access to one or more groups");
        });

        it("can reject a new document when the user does not have 'Assign' access to all the groups in the memberOf array", async () => {
            const testChangeReq_noAssign = plainToClass(ChangeReqDto, {
                doc: {
                    _id: "test-new-post-doc",
                    type: "post",
                    memberOf: ["group-private-content", "group-private-users"],
                },
            });

            const res = await validateChangeRequestAccess(
                testChangeReq_noAssign,
                ["group-private-editors"],
                db,
            );
            expect(res.error).toBe("No 'Assign' access to one or more groups");
        });
    });

    describe("Tag assign access", () => {
        it("can accept a document with no tags", async () => {
            const testChangeReq_noTags = plainToClass(ChangeReqDto, {
                doc: {
                    _id: "post-post2",
                    type: "post",
                    memberOf: ["group-private-content"],
                    content: ["content-post2-eng", "content-post2-fra"],
                    image: "",
                    tags: [],
                },
            });

            const res = await validateChangeRequestAccess(
                testChangeReq_noTags,
                ["group-private-editors"],
                db,
            );
            expect(res.validated).toBe(true);
        });

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
                doc: {
                    _id: "post-post2",
                    type: "post",
                    memberOf: ["group-private-content"],
                    content: ["content-post2-eng", "content-post2-fra"],
                    image: "",
                    tags: ["tag-category2", "tag-topicB"],
                },
            });

            const res = await validateChangeRequestAccess(
                testChangeReq_Tag,
                ["group-private-editors"],
                db,
            );
            expect(res.error).toBe("No 'Assign' access to one or more tags");
        });

        it("can accept a document with no tags", async () => {
            const testChangeReq_noTags = plainToClass(ChangeReqDto, {
                doc: {
                    _id: "post-post2",
                    type: "post",
                    memberOf: ["group-private-content"],
                    content: ["content-post2-eng", "content-post2-fra"],
                    image: "",
                    tags: [],
                },
            });

            const res = await validateChangeRequestAccess(
                testChangeReq_noTags,
                ["group-private-editors"],
                db,
            );
            expect(res.validated).toBe(true);
        });
    });
});
