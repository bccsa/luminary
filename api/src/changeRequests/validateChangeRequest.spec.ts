import "reflect-metadata";
import { validateChangeRequest } from "./validateChangeRequest";
import { DbService } from "../db/db.service";
import { createDbTestingModule } from "../test/testingModule";

describe("validateChangeRequest", () => {
    let db: DbService;

    beforeAll(async () => {
        db = (await createDbTestingModule("validate-change-request")).dbService;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    it("validates a correctly formatted document", async () => {
        const changeRequest = {
            id: 42,
            doc: {
                _id: "lang-eng",
                type: "language",
                memberOf: ["group-languages"],
                languageCode: "eng",
                name: "English",
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(true);
        expect(result.error).toBe(undefined);
    });

    it("fails validation for an invalid change request", async () => {
        const changeRequest = {
            id: 42,
            invalidProperty: {},
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain("Change request validation failed");
    });

    it("fails validation for an invalid document type", async () => {
        const changeRequest = {
            id: 42,
            doc: {
                _id: "lang-eng",
                type: "invalid document type",
                memberOf: ["group-languages"],
                languageCode: "eng",
                name: "English",
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain("Invalid document type");
    });

    it("fails validation for invalid document data", async () => {
        const changeRequest = {
            id: 42,
            doc: {
                _id: "lang-eng",
                type: "language",
                memberOf: "invalid data (should have been an array)",
                languageCode: "eng",
                name: "English",
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain("Submitted language document validation failed");
    });

    it("fails validation for a wrong nested type", async () => {
        const changeRequest = {
            id: 42,
            doc: {
                _id: "test-group",
                type: "group",
                name: "Test",
                acl: [
                    {
                        type: "language",
                        groupId: "group-public-content",
                        permission: ["view"],
                    },
                    {
                        type: "language",
                        groupId: 42, // Intentionally wrong value
                        permission: ["view"],
                    },
                ],
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain("Submitted group document validation failed");
    });

    it("fails validation for a nested field of enums", async () => {
        const changeRequest = {
            id: 42,
            doc: {
                _id: "test-group",
                type: "group",
                name: "Test",
                acl: [
                    {
                        type: "language",
                        groupId: "group-public-content",
                        permission: ["view"],
                    },
                    {
                        type: "language",
                        groupId: "group-private-content",
                        permission: ["view", "invalid"], // This field is modified to include an invalid value
                    },
                ],
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain("Submitted group document validation failed");
    });

    it("removes invalid fields from the document", async () => {
        const changeRequest = {
            id: 42,
            doc: {
                _id: "new-lang",
                type: "language",
                memberOf: ["group-languages"],
                languageCode: "new",
                name: "New Language",
                invalidField: "invalid",
            },
        };

        const result = await validateChangeRequest(changeRequest, ["group-super-admins"], db);
        expect(result.validatedData.invalidField).toBe(undefined);
    });
});
