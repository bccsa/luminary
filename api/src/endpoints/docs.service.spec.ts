import { DocsService } from "./docs.service";
import { DbService } from "../db/db.service";
import { createTestingModule } from "../test/testingModule";
import { DocType } from "../enums";

jest.mock("../configuration", () => {
    const originalModule = jest.requireActual("../configuration");
    const origConfig = originalModule.default();

    return {
        default: () => ({
            ...origConfig,
            permissionMap: `{
                "jwt": {
                    "groups": {
                        "group-super-admins": "() => true"
                    },
                    "userId": {
                        "user-super-admin": "() => true"
                    }
                }
            }`,
        }),
    };
});

describe("Docs service", () => {
    let service: DbService;
    let docsService: DocsService;
    let group: string;

    beforeAll(async () => {
        service = (await createTestingModule("docs-service")).dbService;
        docsService = new DocsService(undefined, service, undefined);
        group = "group-public-content";
    });

    it("can query the api endpoint", async () => {
        const req = {
            apiVersion: "0.0.0",
            gapEnd: 0,
            docTypes: [
                { type: "post", contentOnly: true },
                { type: "content", contentOnly: true },
            ],
            group: group,
            type: DocType.Post,
        };

        const res = await docsService.processReq(req, "");

        expect(res.docs.length).toBe(4);
    });

    it("can get group data from api endpoint", async () => {
        const req = {
            apiVersion: "0.0.0",
            gapEnd: 0,
            docTypes: [
                { type: "group", contentOnly: true },
                { type: "content", contentOnly: true },
            ],
            group: group,
            type: DocType.Group,
        };

        const res = await docsService.processReq(req, "");

        expect(res.docs.length).toBe(8);
    });

    it("can get post data from api endpoint", async () => {
        const req = {
            apiVersion: "0.0.0",
            gapEnd: 0,
            docTypes: [
                { type: "post", contentOnly: true },
                { type: "content", contentOnly: true },
            ],
            group: group,
            type: DocType.Post,
        };

        const res = await docsService.processReq(req, "");

        expect(res.docs.length).toBe(4);
    });

    it("can get tag data from api endpoint", async () => {
        const req = {
            apiVersion: "0.0.0",
            gapEnd: 0,
            docTypes: [
                { type: "tag", contentOnly: true },
                { type: "content", contentOnly: true },
            ],
            group: group,
            type: DocType.Tag,
        };

        const res = await docsService.processReq(req, "");

        expect(res.docs.length).toBe(2);
    });

    it("can get content data from api endpoint", async () => {
        const req = {
            apiVersion: "0.0.0",
            gapEnd: 0,
            docTypes: [
                { type: "post", contentOnly: false },
                { type: "content", contentOnly: true },
            ],
            group: group,
            type: DocType.Post,
            contentOnly: true,
        };

        const res = await docsService.processReq(req, "");

        expect(res.docs.length).toBe(12);
    });
});
