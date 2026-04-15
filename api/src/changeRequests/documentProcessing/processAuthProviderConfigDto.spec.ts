import "reflect-metadata";
import processAuthProviderConfigDto from "./processAuthProviderConfigDto";
import { AuthProviderConfigDto } from "src/dto/AuthProviderConfigDto";

// authProviderConfig is a singleton document holding JWT processing settings for
// every auth provider on the platform, keyed by AuthProviderDto.configId. Its _id
// is always "authProviderConfig"; memberOf is assigned by the caller like other
// docTypes and enforced via ACL.

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

    it("preserves caller-supplied memberOf so it can be assigned like other docTypes", async () => {
        const doc = {
            _id: "authProviderConfig",
            memberOf: ["group-super-admins", "group-editors"],
            providers: {},
        } as unknown as AuthProviderConfigDto;

        await processAuthProviderConfigDto(doc);

        expect(doc.memberOf).toEqual(["group-super-admins", "group-editors"]);
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
