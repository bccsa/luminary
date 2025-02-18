import "reflect-metadata";
import { DbService } from "../db/db.service";
import { createTestingModule } from "../test/testingModule";
import { processChangeRequest } from "./processChangeRequest";
import { PermissionSystem } from "../permissions/permissions.service";
import { changeRequest_content, changeRequest_post } from "../test/changeRequestDocuments";
import { S3Service } from "../s3/s3.service";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { PostDto } from "../dto/PostDto";
import waitForExpect from "wait-for-expect";

describe("processChangeRequest", () => {
    let db: DbService;
    let s3: S3Service;

    beforeAll(async () => {
        const testingModule = await createTestingModule("process-change-request");
        db = testingModule.dbService;
        s3 = testingModule.s3Service;
        PermissionSystem.upsertGroups((await db.getGroups()).docs);
    });

    it("is rejecting invalid change requests", async () => {
        const changeRequest = {
            id: 83,
            doc: {},
        };

        await processChangeRequest("", changeRequest, ["group-super-admins"], db, s3).catch(
            (err) => {
                expect(err.message).toBe(
                    `Submitted "undefined" document validation failed:\nInvalid document type`,
                );
            },
        );
    });

    // TODO: Reactivate change diffs in change requests - https://github.com/bccsa/luminary/issues/442

    it("is not creating a change request when updating a document to the same content", async () => {
        const changeRequest1 = {
            id: 85,
            doc: {
                _id: "new-language",
                type: "language",
                memberOf: ["group-languages"],
                languageCode: "xho",
                name: "Xhoza",
                default: 0,
                translations: {
                    stringTranslation: "String Translation",
                },
            },
        };
        const changeRequest2 = {
            id: 86,
            doc: {
                _id: "new-language",
                type: "language",
                memberOf: ["group-languages"],
                languageCode: "xho",
                name: "Xhoza",
                default: 0,
                translations: {
                    stringTranslation: "String Translation",
                },
            },
        };
        await processChangeRequest("", changeRequest1, ["group-super-admins"], db, s3);
        const processResult = await processChangeRequest(
            "",
            changeRequest2,
            ["group-super-admins"],
            db,
            s3,
        );
        await waitForExpect(() => {
            expect(processResult.message).toBe("Document is identical to the one in the database");
            expect(processResult.changes).toBeUndefined();
        });
    });

    it("can validate a unique slug for a content document that does not exists", async () => {
        const changeRequest = changeRequest_content();
        changeRequest.doc.parentId = "post-blog1";
        changeRequest.doc._id = "test-slug-1";
        changeRequest.doc.slug = "this-is-a-test-slug";

        const res = await processChangeRequest("", changeRequest, ["group-super-admins"], db, s3);
        const dbDoc = await db.getDoc(changeRequest.doc._id);

        expect(res.ok).toBe(true);
        expect(dbDoc.docs[0].slug).toBe("this-is-a-test-slug");
    });

    it("can validate a unique slug for a content document that exists", async () => {
        const changeRequest = changeRequest_content();
        changeRequest.doc.parentId = "post-blog1";
        changeRequest.doc._id = "test-slug-1";
        changeRequest.doc.slug = "this-is-a-test-slug";

        await processChangeRequest("", changeRequest, ["group-super-admins"], db, s3); // ensure that the slug is already in use
        const res = await processChangeRequest("", changeRequest, ["group-super-admins"], db, s3);
        const dbDoc = await db.getDoc(changeRequest.doc._id);

        expect(res.ok).toBe(true);
        expect(dbDoc.docs[0].slug).toBe("this-is-a-test-slug");
    });

    it("can rectify a non-unique slug by appending a random number to the end of the slug", async () => {
        // ensure that the slug is already in use
        const changeRequest1 = changeRequest_content();
        changeRequest1.doc.parentId = "post-blog1";
        changeRequest1.doc._id = "test-slug-1";
        changeRequest1.doc.slug = "this-is-a-test-slug";
        await processChangeRequest("", changeRequest1, ["group-super-admins"], db, s3);

        // Create a new change request with the same slug
        const changeRequest2 = changeRequest_content();
        changeRequest2.doc.parentId = "post-blog1";
        changeRequest2.doc._id = "test-slug-2";
        changeRequest2.doc.slug = "this-is-a-test-slug";

        const res = await processChangeRequest("", changeRequest2, ["group-super-admins"], db, s3);
        const dbDoc = await db.getDoc(changeRequest2.doc._id);

        expect(res.ok).toBe(true);
        expect(dbDoc.docs[0].slug).toMatch(/this-is-a-test-slug-[0-9](0-9)*/);
    });

    it("can automatically rectify a non-valid slug", async () => {
        const changeRequest = changeRequest_content();
        changeRequest.doc.parentId = "post-blog1";
        changeRequest.doc._id = "test-slug-1";
        changeRequest.doc.slug = 'Invalid Slug! 123 無效的 Bør ikke være tilladt "#$%&/()=?`';

        const res = await processChangeRequest("", changeRequest, ["group-super-admins"], db, s3);
        const dbDoc = await db.getDoc(changeRequest.doc._id);

        expect(res.ok).toBe(true);
        expect(dbDoc.docs[0].slug).toBe("invalid-slug-123-wu-xiao-de-bor-ikke-vaere-tilladt");
    });

    it("can set essential properties from a parent document to a content document on content document submission", async () => {
        const changeRequest = changeRequest_content();
        changeRequest.doc.parentId = "post-blog1";
        changeRequest.doc._id = "test-essential-properties";
        changeRequest.doc.memberOf = undefined;
        changeRequest.doc.parentTags = undefined;

        await processChangeRequest("", changeRequest, ["group-super-admins"], db, s3);
        const dbDoc = await db.getDoc(changeRequest.doc._id);

        expect(dbDoc.docs[0].memberOf).toEqual(["group-public-content"]);
        expect(dbDoc.docs[0].parentTags).toEqual(["tag-category1", "tag-topicA"]);
    });

    it("can set essential properties from a parent document to a content document on post / tag document submission", async () => {
        const changeRequest: ChangeReqDto = {
            id: 86,
            doc: {
                _id: "post-blog1",
                type: "post",
                memberOf: ["group-public-content", "group-private-content"],
                image: "test1234.jpg",
                tags: ["tag1", "tag2"],
                publishDateVisible: true,
                postType: "blog",
            } as PostDto,
        };

        PermissionSystem.upsertGroups((await db.getGroups()).docs);
        await processChangeRequest("", changeRequest, ["group-super-admins"], db, s3);

        const res = await db.getContentByParentId(changeRequest.doc._id);
        const docsCount = res.docs.length;
        expect(docsCount).toBeGreaterThan(0);

        expect(
            res.docs.map(
                (doc) =>
                    doc.memberOf.some((m) => m == "group-public-content") &&
                    doc.memberOf.some((m) => m == "group-private-content"),
            ).length,
        ).toBe(docsCount);

        expect(res.docs.map((doc) => doc.image == "test1234.jpg").length).toBe(docsCount);

        expect(
            res.docs.map(
                (doc) =>
                    doc.parentTags.some((m) => m == "tag1") &&
                    doc.parentTags.some((m) => m == "tag2"),
            ).length,
        ).toBe(docsCount);
    });

    it("accepts a change request for a post with postType 'blog'", async () => {
        const changeRequest: ChangeReqDto = {
            id: 87,
            doc: {
                _id: "post-blog2",
                type: "post",
                memberOf: ["group-public-content"],
                image: "test-blog-image.jpg",
                tags: [],
                publishDateVisible: true,
                postType: "blog",
            } as PostDto,
        };

        const processResult = await processChangeRequest(
            "test-user",
            changeRequest,
            ["group-super-admins"],
            db,
            s3,
        );

        expect(processResult.ok).toBe(true);
    });

    it("accepts a change request for a post with postType 'page'", async () => {
        const changeRequest: ChangeReqDto = {
            id: 88,
            doc: {
                _id: "post-page1",
                type: "post",
                memberOf: ["group-public-content"],
                image: "test-page-image.jpg",
                tags: [],
                publishDateVisible: false,
                postType: "page",
            } as PostDto,
        };

        const processResult = await processChangeRequest(
            "test-user",
            changeRequest,
            ["group-super-admins"],
            db,
            s3,
        );

        expect(processResult.ok).toBe(true);
    });

    it("can store the id's of tagged documents to the taggedDocs / parentTaggedDocs property of the tag document and it's content documents", async () => {
        // Ensure that the test doc is in it's original state
        await processChangeRequest("", changeRequest_post(), ["group-super-admins"], db, s3);

        const changeRequest = changeRequest_post();
        changeRequest.doc.tags = ["tag-category2", "tag-topicA"]; // This will remove tag-category1 from the tag and add tag-category2

        await processChangeRequest("", changeRequest, ["group-super-admins"], db, s3);

        const category1 = await db.getDoc("tag-category1");
        const category2 = await db.getDoc("tag-category2");
        const category1Content = await db.getContentByParentId("tag-category1");
        const category2Content = await db.getContentByParentId("tag-category2");

        expect(category1.docs[0].taggedDocs.some((t) => t == changeRequest.doc._id)).toBe(false);
        expect(category2.docs[0].taggedDocs.some((t) => t == changeRequest.doc._id)).toBe(true);
        expect(
            category1Content.docs.filter((d) =>
                d.parentTaggedDocs.some((t) => t == changeRequest.doc._id),
            ).length,
        ).toBe(0);
        expect(
            category2Content.docs.filter((d) =>
                d.parentTaggedDocs.some((t) => t == changeRequest.doc._id),
            ).length,
        ).toBe(category2Content.docs.length);
    });

    it("changes all other language documents' default flag to false if new language doc is selected", async () => {
        const changeRequest: ChangeReqDto = {
            id: 89,
            doc: {
                _id: "lang-eng",
                type: "language",
                memberOf: ["group-languages"],
                languageCode: "eng",
                name: "English",
                default: 1,
                translations: {
                    stringTranslation: "String Translation",
                },
            },
        };

        const processResult = await processChangeRequest(
            "test-user",
            changeRequest,
            ["group-super-admins"],
            db,
            s3,
        );

        expect(processResult.ok).toBe(true);
    });

    it("updates 'availableTranslations' field when new translations are added to a parent", async () => {
        // Create the initial content document
        const changeRequest1 = changeRequest_content();
        changeRequest1.doc.parentId = "post-blog1";
        changeRequest1.doc._id = "content-en";
        changeRequest1.doc.language = "lang-eng";
        await processChangeRequest("test-user", changeRequest1, ["group-super-admins"], db, s3);

        // Add a new translation for the same parent
        const changeRequest2 = changeRequest_content();
        changeRequest2.doc.parentId = "post-blog1";
        changeRequest2.doc._id = "content-fr";
        changeRequest2.doc.language = "lang-fra";
        const processResult = await processChangeRequest(
            "test-user",
            changeRequest2,
            ["group-super-admins"],
            db,
            s3,
        );

        // Fetch the documents from the database
        const dbDocEn = await db.getDoc("content-en");
        const dbDocFr = await db.getDoc("content-fr");

        // Check that the availableTranslations field is updated correctly
        expect(processResult.ok).toBe(true);
        expect(dbDocEn.docs[0].availableTranslations).toEqual(
            expect.arrayContaining(["lang-eng", "lang-fra"]),
        );
        expect(dbDocFr.docs[0].availableTranslations).toEqual(
            expect.arrayContaining(["lang-eng", "lang-fra"]),
        );
    });

    it("fails to update a language document if the document is marked for deletion and is the default language", async () => {
        const changeRequest: ChangeReqDto = {
            id: 90,
            doc: {
                _id: "lang-eng",
                type: "language",
                memberOf: ["group-languages"],
                languageCode: "eng",
                name: "English",
                default: 1,
                translations: {
                    stringTranslation: "String Translation",
                },
                deleteReq: 1,
            },
        };

        await processChangeRequest(
            "test-user",
            changeRequest,
            ["group-super-admins"],
            db,
            s3,
        ).catch((err) => {
            expect(err.message).toBe("Cannot delete the default language document");
        });
    });

    it("can cascade delete requests for post / tag documents to content documents", async () => {
        // Create the initial post document
        const changeRequest1 = changeRequest_post();
        changeRequest1.doc._id = "post-blog3";
        await processChangeRequest("test-user", changeRequest1, ["group-super-admins"], db, s3);

        // Create the initial content document
        const changeRequest2 = changeRequest_content();
        changeRequest2.doc.parentId = "post-blog3";
        changeRequest2.doc._id = "content-en";
        changeRequest2.doc.language = "lang-eng";
        await processChangeRequest("test-user", changeRequest2, ["group-super-admins"], db, s3);

        // Mark the post document for deletion
        const changeRequest3 = changeRequest_post();
        changeRequest3.doc._id = "post-blog3";
        // @ts-expect-error - ignore error
        changeRequest3.doc.deleteReq = 1;
        await processChangeRequest("test-user", changeRequest3, ["group-super-admins"], db, s3);

        // Fetch the documents from the database
        const dbPost = await db.getDoc("post-blog3");
        const dbContent = await db.getDoc("content-en");

        // Check that the documents are deleted
        expect(dbPost.docs.length).toBe(0);
        expect(dbContent.docs.length).toBe(0);
    });
});
