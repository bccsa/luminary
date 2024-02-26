import "reflect-metadata";
import { AccessMap } from "../permissions/AccessMap";
import { DbService } from "../db/db.service";
import { createTestingModule } from "../test/testingModule";
import { processChangeRequest } from "./processChangeRequest";
import { isDeepStrictEqual } from "util";
import { PermissionSystem } from "../permissions/permissions.service";

describe("processChangeRequest", () => {
    let db: DbService;
    let accessMap: AccessMap;

    beforeAll(async () => {
        db = (await createTestingModule("validate-change-request")).dbService;
        PermissionSystem.upsertGroups((await db.getGroups()).docs);
        accessMap = PermissionSystem.getAccessMap(["group-super-admins"]);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    it("is rejecting invalid change requests", async () => {
        const changeRequest = {
            id: 83,
            doc: {},
        };

        await processChangeRequest(changeRequest, new AccessMap(), db).catch((err) => {
            expect(err.message).toBeTruthy();
        });
    });

    it("can insert a change document into the database for a correctly submitted new document", async () => {
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

        const processResult = await processChangeRequest(changeRequest, accessMap, db);
        const res = await db.getDoc(processResult.id);

        expect(isDeepStrictEqual(res.docs[0].changes, changeRequest.doc)).toBe(true);
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
        await processChangeRequest(changeRequest1, accessMap, db);
        const processResult = await processChangeRequest(changeRequest2, accessMap, db);
        expect(processResult).toBe(undefined);
    });
});
