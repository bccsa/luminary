import "reflect-metadata";
import { DbService } from "../db/db.service";
import { createTestingModule } from "../test/testingModule";
import { processChangeRequest } from "./processChangeRequest";
import { PermissionSystem } from "../permissions/permissions.service";
import { S3Service } from "../s3/s3.service";
import waitForExpect from "wait-for-expect";
import processContentDto from "./documentProcessing/processContentDto";
import processPostTagDto from "./documentProcessing/processPostTagDto";
import processLanguageDto from "./documentProcessing/processLanguageDto";
import processGroupDto from "./documentProcessing/processGroupDto";
import {
    changeRequest_post,
    changeRequest_tag,
    changeRequest_language,
    changeRequest_group,
} from "../test/changeRequestDocuments";

jest.mock("./documentProcessing/processContentDto", () => ({
    __esModule: true,
    default: jest.fn(),
}));

jest.mock("./documentProcessing/processPostTagDto", () => ({
    __esModule: true,
    default: jest.fn(),
}));

jest.mock("./documentProcessing/processLanguageDto", () => ({
    __esModule: true,
    default: jest.fn(),
}));

jest.mock("./documentProcessing/processGroupDto", () => ({
    __esModule: true,
    default: jest.fn(),
}));

describe("processChangeRequest", () => {
    let db: DbService;
    let s3: S3Service;

    beforeEach(() => {
        jest.clearAllMocks();
    });

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
            expect(processResult.result.message).toBe(
                "Document is identical to the one in the database",
            );
            expect(processResult.result.changes).toBeUndefined();
        });
    });

    it("calls processContentDto when processing a content change request", async () => {
        const changeRequest = {
            id: 87,
            doc: {
                _id: "new-content",
                type: "content",
                parentType: "post",
                memberOf: ["group-editors"],
                parentId: "post-blog1",
                language: "lang-eng",
                title: "New Content",
                text: "<p>New content body</p>",
                slug: "new-content",
                status: "draft",
            },
        };
        await processChangeRequest("", changeRequest, ["group-super-admins"], db, s3);
        expect(processContentDto).toHaveBeenCalled();
    });

    it("calls processPostTagDto when processing a post change request", async () => {
        const changeRequest = changeRequest_post();
        await processChangeRequest("", changeRequest, ["group-super-admins"], db, s3);
        expect(processPostTagDto).toHaveBeenCalled();
    });

    it("calls processPostTagDto when processing a tag change request", async () => {
        const changeRequest = changeRequest_tag();
        await processChangeRequest("", changeRequest, ["group-super-admins"], db, s3);
        expect(processPostTagDto).toHaveBeenCalled();
    });

    it("calls processLanguageDto when processing a language change request", async () => {
        const changeRequest = changeRequest_language();
        await processChangeRequest("", changeRequest, ["group-super-admins"], db, s3);
        expect(processLanguageDto).toHaveBeenCalled();
    });

    it("calls processGroupDto when processing a group change request", async () => {
        const changeRequest = changeRequest_group();
        await processChangeRequest("", changeRequest, ["group-super-admins"], db, s3);
        expect(processGroupDto).toHaveBeenCalled();
    });
});
