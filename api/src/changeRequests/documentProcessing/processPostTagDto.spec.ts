import { DbService } from "../../db/db.service";
import { S3Service } from "../../s3/s3.service";
import { PostDto } from "../../dto/PostDto";
import { createTestingModule } from "../../test/testingModule";
import { PermissionSystem } from "../../permissions/permissions.service";
import { processChangeRequest } from "../processChangeRequest";
import { changeRequest_content, changeRequest_post } from "../../test/changeRequestDocuments";
import { ChangeReqDto } from "../../dto/ChangeReqDto";
import { DocType } from "../../enums";

describe("processPostTagDto", () => {
    let db: DbService;
    let s3: S3Service;

    beforeAll(async () => {
        const testingModule = await createTestingModule("process-post-tag-dto");
        db = testingModule.dbService;
        s3 = testingModule.s3Service;
        PermissionSystem.upsertGroups((await db.getGroups()).docs);
    });

    it("should cascade Post/Tag delete request to content documents", async () => {
        const postChangeRequest = changeRequest_post();
        postChangeRequest.doc._id = "test-delete-cascade-post";
        const contentChangeRequest = changeRequest_content();
        contentChangeRequest.doc._id = "test-delete-cascade-content";
        contentChangeRequest.doc.parentId = postChangeRequest.doc._id;

        await db.upsertDoc(postChangeRequest.doc);
        await db.upsertDoc(contentChangeRequest.doc);

        const postRes1 = await db.getDoc(postChangeRequest.doc._id);
        const contentRes1 = await db.getDoc(contentChangeRequest.doc._id);

        expect(postRes1.docs.length).toBe(1);
        expect(contentRes1.docs.length).toBe(1);

        postChangeRequest.doc.deleteReq = 1;
        await processChangeRequest("", postChangeRequest, ["group-super-admins"], db, s3);

        const postRes2 = await db.getDoc(postChangeRequest.doc._id);
        const contentRes2 = await db.getDoc(contentChangeRequest.doc._id);

        expect(postRes2.docs.length).toBe(0);
        expect(contentRes2.docs.length).toBe(0);
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
            category1Content.docs.some((d) =>
                d.parentTaggedDocs.some((t) => t == changeRequest.doc._id),
            ),
        ).toBe(false);
        expect(
            category2Content.docs.some((d) =>
                d.parentTaggedDocs.some((t) => t == changeRequest.doc._id),
            ),
        ).toBe(true);
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
        changeRequest3.doc.deleteReq = 1;
        await processChangeRequest("test-user", changeRequest3, ["group-super-admins"], db, s3);

        // Fetch the documents from the database
        const dbPost = await db.getDoc("post-blog3");
        const dbContent = await db.getDoc("content-en");

        // Check that the documents are deleted
        expect(dbPost.docs.length).toBe(0);
        expect(dbContent.docs.length).toBe(0);

        // Check that delete commands are generated for the deleted parent Post child Content documents
        const deleteCommands = await db.getDocsByType(DocType.DeleteCmd);
        expect(deleteCommands.docs.find((d) => d.docId == "post-blog3")).toBeDefined();
        expect(deleteCommands.docs.find((d) => d.docId == "content-en")).toBeDefined();
    });
});
