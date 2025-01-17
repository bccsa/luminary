import { GroupsService } from "./groups.service";
import { DbService } from "../db/db.service";
import { createTestingModule } from "../test/testingModule";

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
    let groupsService: GroupsService;

    beforeAll(async () => {
        service = (await createTestingModule("groups-service")).dbService;
        groupsService = new GroupsService(undefined, service);
    });

    it("can query the api endpoint", async () => {
        const res = await groupsService.processReq("");

        expect(res.docs.length).toBeGreaterThan(0);
    });
});
