import { OAuthProviderService } from "./oAuthProvider.service";
import { createTestingModule } from "../test/testingModule";
import { v4 as UUID } from "uuid";
import { storeCryptoData } from "../util/encryption";
import { DocType, DeleteReason } from "../enums";
import { Auth0CredentialsDto } from "../dto/Auth0CredentialsDto";

describe("OAuthProviderService", () => {
    let dbService: any;

    const testAuth0Credentials: Auth0CredentialsDto = {
        domain: "test-tenant.us.auth0.com",
        clientId: "test-client-id-12345",
        clientSecret: "test-client-secret-super-secure",
        audience: "https://api.example.com",
    };

    beforeAll(async () => {
        const module = await createTestingModule("oauth-provider-testing");
        dbService = module.dbService;
    });

    afterEach(() => {
        // Clear the singleton cache after each test
        OAuthProviderService.clearCache();
    });

    describe("create", () => {
        it("should be defined after creation", async () => {
            // Store encrypted credentials
            const credentialId = await storeCryptoData(dbService, testAuth0Credentials);

            // Create provider document
            const providerId = "oauth-provider-" + UUID();
            const providerDoc = {
                _id: providerId,
                type: DocType.OAuthProvider,
                label: "Test Auth0",
                providerType: "auth0",
                isDefault: true,
                credential_id: credentialId,
                memberOf: [],
            };
            await dbService.upsertDoc(providerDoc);

            // Create service instance
            const service = await OAuthProviderService.create(providerId, dbService);

            expect(service).toBeDefined();
        });

        it("uses singleton pattern - returns same instance for same provider ID", async () => {
            const credentialId = await storeCryptoData(dbService, testAuth0Credentials);
            const providerId = "singleton-test-provider-" + UUID();
            await dbService.upsertDoc({
                _id: providerId,
                type: DocType.OAuthProvider,
                label: "Singleton Test",
                providerType: "auth0",
                credential_id: credentialId,
                memberOf: [],
            });

            const instance1 = await OAuthProviderService.create(providerId, dbService);
            const instance2 = await OAuthProviderService.create(providerId, dbService);

            expect(instance1).toBe(instance2);
        });

        it("throws error when provider not found", async () => {
            const nonExistentId = "non-existent-" + UUID();

            await expect(OAuthProviderService.create(nonExistentId, dbService)).rejects.toThrow(
                `OAuth provider with ID ${nonExistentId} not found`,
            );
        });

        it("throws error when credentials not configured", async () => {
            const providerId = "no-cred-provider-" + UUID();
            await dbService.upsertDoc({
                _id: providerId,
                type: DocType.OAuthProvider,
                label: "No Credentials",
                providerType: "auth0",
                memberOf: [],
                // No credential_id
            });

            await expect(OAuthProviderService.create(providerId, dbService)).rejects.toThrow(
                "No credentials configured",
            );
        });
    });

    describe("getByLabel", () => {
        it("returns provider by label", async () => {
            const credentialId = await storeCryptoData(dbService, testAuth0Credentials);
            const uniqueLabel = "Unique Label " + UUID();
            const providerId = "label-test-provider-" + UUID();
            await dbService.upsertDoc({
                _id: providerId,
                type: DocType.OAuthProvider,
                label: uniqueLabel,
                providerType: "auth0",
                credential_id: credentialId,
                memberOf: [],
            });

            const service = await OAuthProviderService.getByLabel(uniqueLabel, dbService);

            expect(service).toBeDefined();
            expect(service.getCredentials()).toBeDefined();
        });

        it("throws error when label not found", async () => {
            const nonExistentLabel = "Non-existent-" + UUID();

            await expect(
                OAuthProviderService.getByLabel(nonExistentLabel, dbService),
            ).rejects.toThrow(`OAuth provider with label "${nonExistentLabel}" not found`);
        });
    });

    describe("credential getters", () => {
        it("returns decrypted credentials correctly", async () => {
            const credentialId = await storeCryptoData(dbService, testAuth0Credentials);
            const providerId = "getter-test-provider-" + UUID();
            await dbService.upsertDoc({
                _id: providerId,
                type: DocType.OAuthProvider,
                label: "Getter Test",
                providerType: "auth0",
                credential_id: credentialId,
                memberOf: [],
            });

            const service = await OAuthProviderService.create(providerId, dbService);
            const credentials = service.getCredentials();

            expect(credentials.domain).toBe(testAuth0Credentials.domain);
            expect(credentials.clientId).toBe(testAuth0Credentials.clientId);
            expect(credentials.clientSecret).toBe(testAuth0Credentials.clientSecret);
            expect(credentials.audience).toBe(testAuth0Credentials.audience);
        });

        it("returns full credentials object", async () => {
            const credentialId = await storeCryptoData(dbService, testAuth0Credentials);
            const providerId = "full-cred-provider-" + UUID();
            await dbService.upsertDoc({
                _id: providerId,
                type: DocType.OAuthProvider,
                label: "Full Creds Test",
                providerType: "auth0",
                credential_id: credentialId,
                memberOf: [],
            });

            const service = await OAuthProviderService.create(providerId, dbService);
            const credentials = service.getCredentials();

            expect(credentials).toEqual(testAuth0Credentials);
        });
    });

    describe("cache management", () => {
        it("clearCache removes specific provider", async () => {
            const credentialId = await storeCryptoData(dbService, testAuth0Credentials);
            const providerId = "cache-clear-provider-" + UUID();
            await dbService.upsertDoc({
                _id: providerId,
                type: DocType.OAuthProvider,
                label: "Cache Clear Test",
                providerType: "auth0",
                credential_id: credentialId,
                memberOf: [],
            });

            await OAuthProviderService.create(providerId, dbService);
            expect(OAuthProviderService.hasInstance(providerId)).toBe(true);

            OAuthProviderService.clearCache(providerId);
            expect(OAuthProviderService.hasInstance(providerId)).toBe(false);
        });

        it("clearCache without argument clears all instances", async () => {
            const credentialId1 = await storeCryptoData(dbService, testAuth0Credentials);
            const credentialId2 = await storeCryptoData(dbService, testAuth0Credentials);
            const providerId1 = "cache-all-1-" + UUID();
            const providerId2 = "cache-all-2-" + UUID();

            await dbService.upsertDoc({
                _id: providerId1,
                type: DocType.OAuthProvider,
                label: "Cache All Test 1",
                providerType: "auth0",
                credential_id: credentialId1,
                memberOf: [],
            });
            await dbService.upsertDoc({
                _id: providerId2,
                type: DocType.OAuthProvider,
                label: "Cache All Test 2",
                providerType: "auth0",
                credential_id: credentialId2,
                memberOf: [],
            });

            await OAuthProviderService.create(providerId1, dbService);
            await OAuthProviderService.create(providerId2, dbService);

            OAuthProviderService.clearCache();

            expect(OAuthProviderService.hasInstance(providerId1)).toBe(false);
            expect(OAuthProviderService.hasInstance(providerId2)).toBe(false);
        });
    });

    describe("DeleteCmd handling", () => {
        it("removes instance when DeleteCmd is received", async () => {
            OAuthProviderService.initializeChangeListener(dbService);

            const credentialId = await storeCryptoData(dbService, testAuth0Credentials);
            const providerId = "delete-cmd-provider-" + UUID();
            await dbService.upsertDoc({
                _id: providerId,
                type: DocType.OAuthProvider,
                label: "Delete Cmd Test",
                providerType: "auth0",
                credential_id: credentialId,
                memberOf: [],
            });

            await OAuthProviderService.create(providerId, dbService);
            expect(OAuthProviderService.hasInstance(providerId)).toBe(true);

            // Emit DeleteCmd
            const deleteCmd = {
                _id: "delete-cmd-" + UUID(),
                type: DocType.DeleteCmd,
                docId: providerId,
                docType: DocType.OAuthProvider,
                deleteReason: DeleteReason.Deleted,
                updatedTimeUtc: Date.now(),
            };
            dbService.emit("update", deleteCmd);

            // Wait for async processing
            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(OAuthProviderService.hasInstance(providerId)).toBe(false);
        });
    });
});
