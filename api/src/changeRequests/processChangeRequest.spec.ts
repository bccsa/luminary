import "reflect-metadata";
import { DbService } from "../db/db.service";
import { createTestingModule } from "../test/testingModule";
import { processChangeRequest } from "./processChangeRequest";
import { isDeepStrictEqual } from "util";
import { PermissionSystem } from "../permissions/permissions.service";
import { changeRequest_content } from "../test/changeRequestDocuments";

describe("processChangeRequest", () => {
    let db: DbService;

    beforeAll(async () => {
        db = (await createTestingModule("process-change-request")).dbService;
        PermissionSystem.upsertGroups((await db.getGroups()).docs);
    });

    it("is rejecting invalid change requests", async () => {
        const changeRequest = {
            id: 83,
            doc: {},
        };

        await processChangeRequest("", changeRequest, ["group-super-admins"], db).catch((err) => {
            expect(err.message).toBe(
                `Submitted "undefined" document validation failed:\nInvalid document type`,
            );
        });
    });

    it("can insert a change document into the database for a correctly submitted new document with group membership", async () => {
        const changeRequest = {
            id: 84,
            doc: {
                _id: "new-language",
                type: "language",
                memberOf: ["group-languages"],
                languageCode: "xho",
                name: "Xhoza",
            },
        };

        const processResult = await processChangeRequest(
            "test-user",
            changeRequest,
            ["group-super-admins"],
            db,
        );
        const res = await db.getDoc(processResult.id);

        // Remove non user-submitted fields
        delete res.docs[0].changes.updatedTimeUtc;

        expect(isDeepStrictEqual(res.docs[0].changes, changeRequest.doc)).toBe(true);
        expect(res.docs[0].changedByUser).toBe("test-user");
        expect(res.docs[0].memberOf).toEqual(["group-languages"]);
    });

    it("can insert a change document into the database for a correctly submitted new group document", async () => {
        const changeRequest = {
            id: 85,
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
        };

        const processResult = await processChangeRequest(
            "test-user",
            changeRequest,
            ["group-super-admins"],
            db,
        );
        const res = await db.getDoc(processResult.id);

        // Remove non user-submitted fields
        delete res.docs[0].changes.updatedTimeUtc;

        expect(isDeepStrictEqual(res.docs[0].changes, changeRequest.doc)).toBe(true);
        expect(res.docs[0].changedByUser).toBe("test-user");
        expect(isDeepStrictEqual(res.docs[0].acl, changeRequest.doc.acl)).toBe(true);
    });

    it("is not creating a change request when updating a document to the same content", async () => {
        const changeRequest1 = {
            id: 85,
            doc: {
                _id: "new-language",
                type: "language",
                memberOf: ["group-languages"],
                languageCode: "xho",
                name: "Xhoza",
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
            },
        };
        await processChangeRequest("", changeRequest1, ["group-super-admins"], db);
        const processResult = await processChangeRequest(
            "",
            changeRequest2,
            ["group-super-admins"],
            db,
        );
        expect(processResult.message).toBe("Document is identical to the one in the database");
        expect(processResult.changes).toBeUndefined();
    });

    it("can validate a unique slug for a content document that does not exists", async () => {
        const changeRequest = changeRequest_content();
        changeRequest.doc.parentId = "post-post1";
        changeRequest.doc._id = "test-slug-1";
        changeRequest.doc.slug = "this-is-a-test-slug";

        const res = await processChangeRequest("", changeRequest, ["group-super-admins"], db);
        const dbDoc = await db.getDoc(changeRequest.doc._id);

        expect(res.ok).toBe(true);
        expect(dbDoc.docs[0].slug).toBe("this-is-a-test-slug");
    });

    it("can validate a unique slug for a content document that exists", async () => {
        // This test relies on the previous test to have run first
        const changeRequest = changeRequest_content();
        changeRequest.doc.parentId = "post-post1";
        changeRequest.doc._id = "test-slug-1";
        changeRequest.doc.slug = "this-is-a-test-slug";

        const res = await processChangeRequest("", changeRequest, ["group-super-admins"], db);
        const dbDoc = await db.getDoc(changeRequest.doc._id);

        expect(res.ok).toBe(true);
        expect(dbDoc.docs[0].slug).toBe("this-is-a-test-slug");
    });

    it("can rectify a non-unique slug by appending a random number to the end of the slug", async () => {
        // This test relies on the previous test to have run first
        const changeRequest = changeRequest_content();
        changeRequest.doc.parentId = "post-post1";
        changeRequest.doc._id = "test-slug-2";
        changeRequest.doc.slug = "this-is-a-test-slug";

        const res = await processChangeRequest("", changeRequest, ["group-super-admins"], db);
        const dbDoc = await db.getDoc(changeRequest.doc._id);

        expect(res.ok).toBe(true);
        expect(dbDoc.docs[0].slug).toMatch(/this-is-a-test-slug-[0-9](0-9)*/);
    });

    it("can automatically rectify a non-valid slug", async () => {
        const changeRequest = changeRequest_content();
        changeRequest.doc.parentId = "post-post1";
        changeRequest.doc._id = "test-slug-1";
        changeRequest.doc.slug = 'Invalid Slug! 123 無效的 Bør ikke være tilladt "#$%&/()=?`';

        const res = await processChangeRequest("", changeRequest, ["group-super-admins"], db);
        const dbDoc = await db.getDoc(changeRequest.doc._id);

        expect(res.ok).toBe(true);
        expect(dbDoc.docs[0].slug).toBe("invalid-slug-123-wu-xiao-de-bor-ikke-vaere-tilladt");
    });
});
