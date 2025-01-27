import { DbService } from "../db/db.service";
import { createTestingModule } from "../test/testingModule";
import { ChangeRequestService } from "./changeRequest.service";
import { AckStatus } from "../enums";
import { changeRequest_post } from "../test/changeRequestDocuments";

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

describe("ChangeRequest service", () => {
    let service: DbService;
    let changeRequestService: ChangeRequestService;

    beforeAll(async () => {
        service = (await createTestingModule("changereq-service")).dbService;
        changeRequestService = new ChangeRequestService(undefined, service, undefined);
    });

    it("can query the api endpoint", async () => {
        const res = await changeRequestService.changeRequest(changeRequest_post(), "");

        expect(res.ack).toBe(AckStatus.Accepted);
    });
});
