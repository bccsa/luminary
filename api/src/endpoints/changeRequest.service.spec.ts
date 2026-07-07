import { DbService } from "../db/db.service";
import { createTestingModule } from "../test/testingModule";
import { ChangeRequestService } from "./changeRequest.service";
import { AckStatus } from "../enums";
import { changeRequest_post } from "../test/changeRequestDocuments";
import { PermissionSystem } from "../permissions/permissions.service";
import { JwtUserDetails } from "../auth/authIdentity.service";

describe("ChangeRequest service", () => {
    let service: DbService;
    let changeRequestService: ChangeRequestService;
    let mockUserDetails: JwtUserDetails;

    beforeAll(async () => {
        service = (await createTestingModule("changereq-service")).dbService;
        changeRequestService = new ChangeRequestService(undefined, service);

        mockUserDetails = {
            userId: "user-super-admin",
            groups: ["group-super-admins"],
            email: "test@123.com",
            name: "Test User",
            accessMap: PermissionSystem.getAccessMap(["group-super-admins"]),
        };
    });

    it("can query the api endpoint", async () => {
        const res = await changeRequestService.changeRequest(changeRequest_post(), mockUserDetails);

        expect(res.ack).toBe(AckStatus.Accepted);
    });

    it("can submit a single change request and receive an acknowledgement", async () => {
        const changeRequest = {
            doc: {
                _id: "lang-eng",
                type: "language",
                memberOf: ["group-languages"],
                languageCode: "eng",
                name: "English",
                translations: {
                    stringTranslation: "String Translation",
                },
            },
        };

        const res = await changeRequestService.changeRequest(changeRequest, mockUserDetails);
        expect(res.message).toBe(undefined);
        expect(res.ack).toBe("accepted");
    });

    it("can correctly fail validation of an invalid change request", async () => {
        const changeRequest = {
            invalidProperty: {},
        };

        // @ts-expect-error - we are testing invalid input
        const res = await changeRequestService.changeRequest(changeRequest, mockUserDetails);
        expect(res.ack).toBe("rejected");
        expect(res.message).toContain("Change request validation failed");
    });

    it("sends the existing document back when validation fails", async () => {
        const changeRequest = {
            doc: {
                _id: "lang-eng",
                type: "invalid",
                memberOf: ["group-languages"],
                languageCode: "eng",
                name: "Changed language name",
            },
        };

        const res = await changeRequestService.changeRequest(changeRequest, mockUserDetails);

        expect(res.message).toContain("Invalid document type");
        expect(res.ack).toBe("rejected");

        const docs: any[] = res.docs;
        expect(docs[0]._id).toBe("lang-eng");
        expect(docs[0].type).toBe("language");
        expect(docs[0].name).toBe("English");
    });

    it("can create an authProvider document via change request", async () => {
        const changeRequest = {
            doc: {
                _id: "provider-test-1",
                type: "authProvider",
                memberOf: ["group-super-admins"],
                domain: "test.auth0.com",
                clientId: "client-id-1",
                audience: "https://api.test.com",
                configId: "config-entry-test-1",
                label: "Test Provider",
            },
        };

        const res = await changeRequestService.changeRequest(changeRequest, mockUserDetails);
        expect(res.ack).toBe(AckStatus.Accepted);
    });

    it("reverts only the slug field (not the whole doc) when a redirect's slug collides with another redirect", async () => {
        const changeRequest = {
            doc: {
                _id: "redirect-post2",
                type: "redirect",
                memberOf: ["group-private-content"],
                redirectType: "permanent",
                // Colliding "from" slug — already claimed by redirect-post1 (seeded).
                slug: "post1-eng",
                // Unrelated field the user also edited in the same submission.
                toSlug: "new-target-eng",
            },
        };

        const res = await changeRequestService.changeRequest(changeRequest, mockUserDetails);

        expect(res.ack).toBe("rejected");
        expect(res.message).toContain("Slug already has a redirect");

        const docs: any[] = res.docs;
        expect(docs.length).toBe(1);
        expect(docs[0]._id).toBe("redirect-post2");
        // Reverted to the persisted value...
        expect(docs[0].slug).toBe("post2-eng");
        // ...but the rest of the submitted doc (including the unrelated edit) is preserved,
        // not clobbered by the whole prior doc.
        expect(docs[0].toSlug).toBe("new-target-eng");
    });

    it("does not crash building the ack when a rejected Post has no prior doc but has content children", async () => {
        const orphanPostId = `post-orphan-${Date.now()}`;
        const orphanContentId = `content-orphan-${Date.now()}`;

        // Content pointing at a post id that has never itself been persisted — e.g. the Post's
        // own change request hasn't landed yet, or was rolled back out-of-band.
        await service.upsertDoc({
            _id: orphanContentId,
            type: "content",
            memberOf: ["group-public-content"],
            parentId: orphanPostId,
            parentType: "post",
            language: "lang-eng",
            status: "published",
            slug: `orphan-slug-${Date.now()}`,
            title: "Orphan content",
        } as any);

        const changeRequest = {
            doc: {
                _id: orphanPostId,
                type: "post",
                memberOf: ["group-public-content"],
                // Deliberately missing required PostDto fields (postType, etc.) to force a
                // validation rejection while doc.type is still "post".
            },
        };

        // Must not throw (regression: `ack.docs.push` on an unset `ack.docs` when there is no
        // prior doc for the rejected Post/Tag).
        const res = await changeRequestService.changeRequest(changeRequest, mockUserDetails);

        expect(res.ack).toBe("rejected");
        expect(res.docs).toBeDefined();
        expect(res.docs.some((d: any) => d._id === orphanContentId)).toBe(true);
    });

    it("returns the post/tag document with associated content documents when a delete request is rejected", async () => {
        // Update post-blog1 so that group-super-admins do not have access to it
        const postDoc = { ...(await service.getDoc("post-blog1")).docs[0] };
        await service.upsertDoc({ ...postDoc, memberOf: ["invalid-group"] });

        const changeRequest = {
            doc: { ...postDoc, deleteReq: 1 },
        };

        const res = await changeRequestService.changeRequest(changeRequest, mockUserDetails);

        expect(res.message).toBe("No 'Delete' access to document");
        expect(res.ack).toBe("rejected");
        expect(res.docs.length).toBe(3);

        const docs: any[] = res.docs;
        expect(docs[0]._id).toBe("post-blog1");
        expect(docs[0].type).toBe("post");
        expect(docs[1]._id).toBe("content-blog1-eng");
        expect(docs[2]._id).toBe("content-blog1-fra");
    });
});
