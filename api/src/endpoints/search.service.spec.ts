import { SearchService } from "./search.service";
import { DbService } from "../db/db.service";
import { createTestingModule } from "../test/testingModule";
import { DeleteReason, DocType } from "../enums";
import { SearchReqDto } from "../dto/SearchReqDto";
import { DeleteCmdDto } from "src/dto/DeleteCmdDto";

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

describe("Search service", () => {
    let service: DbService;
    let searchService: SearchService;

    beforeAll(async () => {
        service = (await createTestingModule("search-service")).dbService;
        searchService = new SearchService(undefined, service);
    });

    it("can query the api endpoint", async () => {
        const req: SearchReqDto = {
            apiVersion: "0.0.0",
            limit: 10,
            types: [DocType.Post, DocType.Group],
        };

        const res = await searchService.processReq(req, "");

        expect(res.docs.length).toBe(10);
    });

    it("can include delete commands in the query result", async () => {
        await service.insertDoc({
            _id: "test-delete",
            type: DocType.DeleteCmd,
            updatedTimeUtc: Date.now(),
            docId: "test-delete-doc",
            docType: DocType.Post,
            deleteReason: DeleteReason.Deleted,
            memberOf: ["group-public-content"],
        } as DeleteCmdDto);

        const req: SearchReqDto = {
            apiVersion: "0.0.0",
            limit: 10,
            types: [DocType.Post, DocType.Group],
            includeDeleteCmds: true,
        };

        const res = await searchService.processReq(req, "");

        expect(res.docs.some((d) => d.type == DocType.DeleteCmd && d._id == "test-delete")).toBe(
            true,
        );
    });

    it("does not include delete commands in the query result if not requested", async () => {
        await service.insertDoc({
            _id: "test-delete2",
            type: DocType.DeleteCmd,
            updatedTimeUtc: Date.now(),
            docId: "test-delete-doc2",
            docType: DocType.Post,
            deleteReason: DeleteReason.Deleted,
            memberOf: ["group-public-content"],
        } as DeleteCmdDto);

        const req: SearchReqDto = {
            apiVersion: "0.0.0",
            limit: 10,
            types: [DocType.Post, DocType.Group],
        };

        const res = await searchService.processReq(req, "");

        expect(res.docs.some((d) => d.type == DocType.DeleteCmd && d._id == "test-delete")).toBe(
            false,
        );
    });
});
