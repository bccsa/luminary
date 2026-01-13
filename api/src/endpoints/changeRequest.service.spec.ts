import { DbService } from "../db/db.service";
import { createTestingModule } from "../test/testingModule";
import { ChangeRequestService } from "./changeRequest.service";
import { AckStatus } from "../enums";
import { changeRequest_post } from "../test/changeRequestDocuments";

describe("ChangeRequest service", () => {
    const oldEnv = process.env;
    let service: DbService;
    let changeRequestService: ChangeRequestService;

    beforeAll(async () => {
        process.env = { ...oldEnv }; // Make a copy of the old environment variables

        process.env.JWT_MAPPINGS = `{
            "groups": {
                "group-super-admins": "() => true"
            },
            "userId": "() => 'user-super-admin'",
            "email": "() => 'test@123.com'",
            "name": "() => 'Test User'"
        }`;

        service = (await createTestingModule("changereq-service")).dbService;
        changeRequestService = new ChangeRequestService(undefined, service);
    });

    afterAll(async () => {
        process.env = oldEnv; // Restore the original environment variables
    });

    it("can query the api endpoint", async () => {
        const res = await changeRequestService.changeRequest(changeRequest_post(), "");

        expect(res.ack).toBe(AckStatus.Accepted);
    });

    it("can submit a single change request and receive an acknowledgement", async () => {
        const changeRequest = {
            id: 42,
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

        const res = await changeRequestService.changeRequest(changeRequest, "");
        expect(res.id).toBe(42);
        expect(res.message).toBe(undefined);
        expect(res.ack).toBe("accepted");
    });

    it("can correctly fail validation of an invalid change request", async () => {
        const changeRequest = {
            id: 42,
            invalidProperty: {},
        };

        // @ts-expect-error - we are testing invalid input
        const res = await changeRequestService.changeRequest(changeRequest, "");
        expect(res.id).toBe(42);
        expect(res.ack).toBe("rejected");
        expect(res.message).toContain("Change request validation failed");
    });

    it("sends the existing document back when validation fails", async () => {
        const changeRequest = {
            id: 42,
            doc: {
                _id: "lang-eng",
                type: "invalid",
                memberOf: ["group-languages"],
                languageCode: "eng",
                name: "Changed language name",
            },
        };

        const res = await changeRequestService.changeRequest(changeRequest, "");

        expect(res.id).toBe(42);
        expect(res.message).toContain("Invalid document type");
        expect(res.ack).toBe("rejected");

        const docs: any[] = res.docs;
        expect(docs[0]._id).toBe("lang-eng");
        expect(docs[0].type).toBe("language");
        expect(docs[0].name).toBe("English");
    });

    it("returns the post/tag document with associated content documents when a delete request is rejected", async () => {
        // Update post-blog1 so that group-super-admins do not have access to it
        const postDoc = { ...(await service.getDoc("post-blog1")).docs[0] };
        await service.upsertDoc({ ...postDoc, memberOf: ["invalid-group"] });

        const changeRequest = {
            id: 43,
            doc: { ...postDoc, deleteReq: 1 },
        };

        const res = await changeRequestService.changeRequest(changeRequest, "");

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
