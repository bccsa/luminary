import processOAuthProviderDto from "./processOAuthProviderDto";
import { DbService } from "../../db/db.service";
import { createTestingModule } from "../../test/testingModule";
import { changeRequest_oAuthProvider } from "../../test/changeRequestDocuments";
import { retrieveCryptoData } from "../../util/encryption";
import { Auth0CredentialSecretsDto } from "../../dto/Auth0CredentialsDto";

jest.mock("./processImageDto", () => ({
    __esModule: true,
    default: jest.fn().mockResolvedValue(undefined),
}));

describe("processOAuthProviderDto", () => {
    let db: DbService;

    beforeAll(async () => {
        const testingModule = await createTestingModule("process-oauth-provider-dto");
        db = testingModule.dbService;
    });

    it("encrypts only clientSecret and sets public fields on doc", async () => {
        const { doc } = changeRequest_oAuthProvider();
        const domain = doc.credential!.domain;
        const clientId = doc.credential!.clientId;
        const clientSecret = doc.credential!.clientSecret;
        const audience = doc.credential!.audience;

        await db.upsertDoc(doc);
        await processOAuthProviderDto(doc, undefined, db);

        expect(doc.credential_id).toBeDefined();
        expect(doc.credential).toBeUndefined();
        expect(doc.domain).toBe(domain);
        expect(doc.clientId).toBe(clientId);
        expect(doc.audience).toBe(audience);

        const storedSecrets = await retrieveCryptoData<Auth0CredentialSecretsDto>(
            db,
            doc.credential_id!,
        );
        expect(storedSecrets).toEqual({ clientSecret });
        expect(storedSecrets.clientSecret).toBe(clientSecret);

        const rawResult = await db.getDoc(doc.credential_id!);
        expect(rawResult.docs.length).toBe(1);
        expect(rawResult.docs[0].data).toBeDefined();
        expect(rawResult.docs[0].data.encrypted).toBeDefined();
        expect(typeof rawResult.docs[0].data.encrypted).toBe("string");
    });

    it("throws when neither credential nor credential_id", async () => {
        const { doc } = changeRequest_oAuthProvider();
        delete doc.credential;
        delete doc.credential_id;

        await db.upsertDoc(doc);

        await expect(
            processOAuthProviderDto(doc, undefined, db),
        ).rejects.toThrow("Missing OAuth provider credentials");
    });

    it("replaces credentials when both credential and credential_id provided", async () => {
        const { doc } = changeRequest_oAuthProvider();
        doc.credential_id = "existing-cred-id";
        const newDomain = "new-tenant.auth0.com";
        doc.credential!.domain = newDomain;

        await db.upsertDoc(doc);

        const warnings = await processOAuthProviderDto(doc, undefined, db);

        expect(warnings).toContain(
            "The previous credentials will be deleted and replaced with new ones.",
        );
        expect(doc.credential_id).toBeDefined();
        expect(doc.credential_id).not.toBe("existing-cred-id");
        expect(doc.credential).toBeUndefined();
        expect(doc.domain).toBe(newDomain);
        expect(doc.clientId).toBe("client123");
        expect(doc.audience).toBe("https://api.example.com");
    });

    it("deletion removes credential document", async () => {
        const { doc } = changeRequest_oAuthProvider();
        await db.upsertDoc(doc);
        await processOAuthProviderDto(doc, undefined, db);

        const credentialId = doc.credential_id;
        expect(credentialId).toBeDefined();

        doc.deleteReq = 1;
        await db.upsertDoc(doc);
        await processOAuthProviderDto(doc, doc, db);

        const deletedResult = await db.getDoc(credentialId!);
        expect(deletedResult.docs.length).toBe(0);
    });
});
