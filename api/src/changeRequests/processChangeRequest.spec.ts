import "reflect-metadata";
import { DbService } from "../db/db.service";
import { createTestingModule } from "../test/testingModule";
import { processChangeRequest } from "./processChangeRequest";
import { PermissionSystem } from "../permissions/permissions.service";
import { S3Service } from "../s3/s3.service";
import waitForExpect from "wait-for-expect";
import { S3MediaService } from "../s3-media/media.service";

describe("processChangeRequest", () => {
    let db: DbService;
    let s3: S3Service;
    let s3Media: S3MediaService;

    beforeAll(async () => {
        const testingModule = await createTestingModule("process-change-request");
        db = testingModule.dbService;
        s3 = testingModule.s3Service;
        s3Media = testingModule.s3MediaService;
        PermissionSystem.upsertGroups((await db.getGroups()).docs);
    });

    it("is rejecting invalid change requests", async () => {
        const changeRequest = {
            id: 83,
            doc: {},
        };

        await processChangeRequest(
            "",
            changeRequest,
            ["group-super-admins"],
            db,
            s3,
            s3Media,
        ).catch((err) => {
            expect(err.message).toBe(
                `Submitted "undefined" document validation failed:\nInvalid document type`,
            );
        });
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
        await processChangeRequest("", changeRequest1, ["group-super-admins"], db, s3, s3Media);
        const processResult = await processChangeRequest(
            "",
            changeRequest2,
            ["group-super-admins"],
            db,
            s3,
            s3Media,
        );
        await waitForExpect(() => {
            expect(processResult.result.message).toBe(
                "Document is identical to the one in the database",
            );
            expect(processResult.result.changes).toBeUndefined();
        });
    });
});
