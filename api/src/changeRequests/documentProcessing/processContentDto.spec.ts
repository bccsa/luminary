import "reflect-metadata";
import { DbService } from "../../db/db.service";
import { createTestingModule } from "../../test/testingModule";
import { processChangeRequest } from "../processChangeRequest";
import { PermissionSystem } from "../../permissions/permissions.service";
import { changeRequest_content } from "../../test/changeRequestDocuments";
import { S3Service } from "../../s3/s3.service";
import { ChangeReqDto } from "../../dto/ChangeReqDto";
import { PostDto } from "../../dto/PostDto";

describe("processContentDto", () => {
    let db: DbService;
    let s3: S3Service;

    beforeAll(async () => {
        const testingModule = await createTestingModule("process-content-dto");
        db = testingModule.dbService;
        s3 = testingModule.s3Service;
        PermissionSystem.upsertGroups((await db.getGroups()).docs);
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
});
