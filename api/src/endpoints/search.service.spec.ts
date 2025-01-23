import { SearchService } from "./search.service";
import { DbService } from "../db/db.service";
import { createTestingModule } from "../test/testingModule";
import { DocType } from "../enums";
import { SearchReqDto } from "src/dto/EndpointsReqDto";

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
});
