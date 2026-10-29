import { DbService } from "../db/db.service";
import { createTestingModule } from "../test/testingModule";
import { ChangeRequestService } from "./changeRequest.service";
import { AckStatus } from "../enums";
import { changeRequest_post } from "../test/changeRequestDocuments";
import { PermissionSystem } from "../permissions/permissions.service";
import { JwtUserDetails } from "../auth/authIdentity.service";
import { IdentityCacheService } from "../auth/identityCache.service";

describe("ChangeRequest service", () => {
    let service: DbService;
    let changeRequestService: ChangeRequestService;
    let mockUserDetails: JwtUserDetails;
    const identityCacheService = { invalidate: jest.fn() };

    beforeAll(async () => {
        service = (await createTestingModule("changereq-service")).dbService;
        changeRequestService = new ChangeRequestService(
            service,
            identityCacheService as unknown as IdentityCacheService,
        );

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

    describe("identity cache invalidation", () => {
        const userDoc = async () => ({ ...(await service.getDoc("user-editor1")).docs[0] });

        beforeEach(() => {
            identityCacheService.invalidate.mockClear();
        });

        it("invalidates cached identities after an accepted User change request", async () => {
            const doc = { ...(await userDoc()), name: "Editor 1 renamed" };

            const res = await changeRequestService.changeRequest({ doc }, mockUserDetails);

            expect(res.ack).toBe(AckStatus.Accepted);
            expect(identityCacheService.invalidate).toHaveBeenCalledTimes(1);
        });

        it("does not invalidate when a User change request is rejected", async () => {
            const doc = { ...(await userDoc()), email: "not-an-email" };

            const res = await changeRequestService.changeRequest({ doc }, mockUserDetails);

            expect(res.ack).toBe(AckStatus.Rejected);
            expect(identityCacheService.invalidate).not.toHaveBeenCalled();
        });

        it("does not invalidate for change requests on other document types", async () => {
            const res = await changeRequestService.changeRequest(
                changeRequest_post(),
                mockUserDetails,
            );

            expect(res.ack).toBe(AckStatus.Accepted);
            expect(identityCacheService.invalidate).not.toHaveBeenCalled();
        });
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
