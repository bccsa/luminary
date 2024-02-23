import "reflect-metadata";
import { AccessMap } from "../permissions/AccessMap";
import { validateChangeRequest } from "./validateChangeRequest";
import { DbService } from "../db/db.service";
import * as validateChangeRequestAccess from "./validateChangeRequestAccess";
import { createTestingModule } from "../test/testingModule";

describe("validateChangeRequest", () => {
    let validateChangeRequestAccessSpy: jest.SpyInstance;
    let db: DbService;

    beforeAll(async () => {
        db = (await createTestingModule("validate-change-request")).dbService;

        validateChangeRequestAccessSpy = jest
            .spyOn(validateChangeRequestAccess, "validateChangeRequestAccess")
            .mockResolvedValue({
                validated: true,
            });
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

        const result = await validateChangeRequest(changeRequest, new AccessMap(), db);

        expect(result.validated).toBe(true);
        expect(result.error).toBe(undefined);
        expect(validateChangeRequestAccessSpy).toHaveBeenCalled();
    });

    it("fails validation for an invalid change request", async () => {
        const changeRequest = {
            id: 42,
            invalidProperty: {},
        };

        const result = await validateChangeRequest(changeRequest, new AccessMap(), db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain("Change request validation failed");
        expect(validateChangeRequestAccessSpy).not.toHaveBeenCalled();
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

        const result = await validateChangeRequest(changeRequest, new AccessMap(), db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain("Invalid document type");
        expect(validateChangeRequestAccessSpy).not.toHaveBeenCalled();
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

        const result = await validateChangeRequest(changeRequest, new AccessMap(), db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain("Submitted language document validation failed");
        expect(validateChangeRequestAccessSpy).not.toHaveBeenCalled();
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

        const result = await validateChangeRequest(changeRequest, new AccessMap(), db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain("Submitted group document validation failed");
        expect(validateChangeRequestAccessSpy).not.toHaveBeenCalled();
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

        const result = await validateChangeRequest(changeRequest, new AccessMap(), db);

        expect(result.validated).toBe(false);
        expect(result.error).toContain("Submitted group document validation failed");
        expect(validateChangeRequestAccessSpy).not.toHaveBeenCalled();
    });
});
