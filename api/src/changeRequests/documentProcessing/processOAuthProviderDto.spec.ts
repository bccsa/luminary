import processOAuthProviderDto from "./processOAuthProviderDto";
import { DbService } from "../../db/db.service";
import { createTestingModule } from "../../test/testingModule";
import { changeRequest_oAuthProvider } from "../../test/changeRequestDocuments";

jest.mock("./processImageDto", () => ({
    __esModule: true,
    default: jest.fn().mockResolvedValue(undefined),
}));

describe("processOAuthProviderDto", () => {
    let db: DbService;

    beforeAll(async () => {
        const testingModule = await createTestingModule(
            "process-oauth-provider-dto",
        );
        db = testingModule.dbService;
    });

    it("sets public fields and members on doc", async () => {
        const { doc } = changeRequest_oAuthProvider();
        const domain = doc.domain;
        const clientId = doc.clientId;
        const audience = doc.audience;

        await db.upsertDoc(doc);
        await processOAuthProviderDto(doc, undefined, db);

        expect(doc.domain).toBe(domain);
        expect(doc.clientId).toBe(clientId);
        expect(doc.audience).toBe(audience);
        expect(doc.memberOf).toContain("group-public-content");
    });
});
