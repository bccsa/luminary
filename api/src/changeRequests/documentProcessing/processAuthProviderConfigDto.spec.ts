import "reflect-metadata";
import processAuthProviderConfigDto from "./processAuthProviderConfigDto";
import { AuthProviderConfigDto } from "src/dto/AuthProviderConfigDto";

// authProviderConfig is a singleton document holding JWT processing settings for
// every auth provider on the platform, keyed by AuthProviderDto.configId. Its _id
// is always "authProviderConfig" and memberOf is always ["group-super-admins"] so
// only super-admins can view or edit it via ACL.

describe("processAuthProviderConfigDto", () => {
    it("enforces the singleton _id of 'authProviderConfig' to prevent duplicate docs", async () => {
        const doc = {
            _id: "some-random-id",
            memberOf: [],
            providers: {},
        } as unknown as AuthProviderConfigDto;

        await processAuthProviderConfigDto(doc);

        expect(doc._id).toBe("authProviderConfig");
    });

    it("overwrites any caller-supplied _id with 'authProviderConfig'", async () => {
        const doc = {
            _id: "attacker-supplied-id",
            memberOf: [],
            providers: { "config-1": {} },
        } as unknown as AuthProviderConfigDto;

        await processAuthProviderConfigDto(doc);

        expect(doc._id).toBe("authProviderConfig");
    });

    it("locks memberOf to ['group-super-admins'] to prevent privilege escalation on the singleton", async () => {
        const doc = {
            _id: "authProviderConfig",
            memberOf: ["group-public", "group-editors"],
            providers: {},
        } as unknown as AuthProviderConfigDto;

        await processAuthProviderConfigDto(doc);

        expect(doc.memberOf).toEqual(["group-super-admins"]);
    });

    it("preserves the providers map unchanged — these are the per-provider JWT settings", async () => {
        const providers = {
            "config-1": {
                claimNamespace: "https://example.com/meta",
                userFieldMappings: { externalUserId: "sub", email: "email", name: "name" },
            },
            "config-2": {
                groupMappings: [
                    { groupId: "group-editors", conditions: [{ type: "authenticated" }] },
                ],
            },
        };
        const doc = {
            _id: "authProviderConfig",
            memberOf: [],
            providers,
        } as unknown as AuthProviderConfigDto;

        await processAuthProviderConfigDto(doc);

        expect(doc.providers).toEqual(providers);
    });
});
