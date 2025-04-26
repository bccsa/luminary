import { SearchService } from "./search.service";
import { DbService } from "../db/db.service";
import { createTestingModule } from "../test/testingModule";
import { DeleteReason, DocType } from "../enums";
import { SearchReqDto } from "../dto/SearchReqDto";
import { DeleteCmdDto } from "../dto/DeleteCmdDto";

describe("Search service", () => {
    const oldEnv = process.env;
    let service: DbService;
    let searchService: SearchService;

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

        service = (await createTestingModule("search-service")).dbService;
        searchService = new SearchService(undefined, service);
    });

    afterAll(async () => {
        process.env = oldEnv; // Restore the original environment variables
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

    it("throws an error if neither slug nor types are provided in the request", async () => {
        const req: SearchReqDto = {
            apiVersion: "0.0.0",
            limit: 10,
            types: [],
        };

        await expect(searchService.processReq(req, "")).rejects.toThrow(
            "Missing required parameters: slug or types",
        );

        const req2: SearchReqDto = {
            apiVersion: "0.0.0",
            limit: 10,
            slug: "",
        };

        await expect(searchService.processReq(req2, "")).rejects.toThrow(
            "Missing required parameters: slug or types",
        );

        const req3: SearchReqDto = {
            apiVersion: "0.0.0",
            limit: 10,
        };
        await expect(searchService.processReq(req3, "")).rejects.toThrow(
            "Missing required parameters: slug or types",
        );

        const req4: SearchReqDto = {
            apiVersion: "0.0.0",
            limit: 10,
            types: [DocType.Post],
        };
        await expect(searchService.processReq(req4, "")).resolves.toBeDefined();
    });

    it("throws an error if invalid parameters are provided with slug", async () => {
        const req: SearchReqDto = {
            apiVersion: "0.0.0",
            slug: "test-slug",
            limit: 10,
            types: [DocType.Post],
        };

        await expect(searchService.processReq(req, "")).rejects.toThrow(
            "Invalid parameters: A 'slug' search request is invalid when used together with limit, types",
        );
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
