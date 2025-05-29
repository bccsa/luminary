import { DbService } from "../db/db.service";
import { createTestingModule } from "../test/testingModule";
import { ChangeRequestService } from "./changeRequest.service";
import { AckStatus } from "../enums";
import { changeRequest_post } from "../test/changeRequestDocuments";

describe("ChangeRequest service", () => {
    const oldEnv = process.env;
    let service: DbService;
    let changeRequestService: ChangeRequestService;

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

        service = (await createTestingModule("changereq-service")).dbService;
        changeRequestService = new ChangeRequestService(undefined, service, undefined);
    });

    afterAll(async () => {
        process.env = oldEnv; // Restore the original environment variables
    });

    it("can query the api endpoint", async () => {
        const res = await changeRequestService.changeRequest(changeRequest_post(), "");

        expect(res.ack).toBe(AckStatus.Accepted);
    });
});
