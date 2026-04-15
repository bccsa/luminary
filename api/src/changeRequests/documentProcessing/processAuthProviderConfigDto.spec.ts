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

    it("preserves non-mapping provider fields unchanged — these are the per-provider JWT settings", async () => {
        const doc = {
            _id: "authProviderConfig",
            memberOf: [],
            providers: {
                "config-1": {
                    claimNamespace: "https://example.com/meta",
                    userFieldMappings: { externalUserId: "sub", email: "email", name: "name" },
                },
                "config-2": {
                    groupMappings: [
                        { groupIds: ["group-editors"], conditions: [{ type: "authenticated" }] },
                    ],
                },
            },
        } as unknown as AuthProviderConfigDto;

        await processAuthProviderConfigDto(doc);

        expect(doc.providers["config-1"]).toEqual({
            claimNamespace: "https://example.com/meta",
            userFieldMappings: { externalUserId: "sub", email: "email", name: "name" },
        });
        expect(doc.providers["config-2"].groupMappings).toEqual([
            { groupIds: ["group-editors"], conditions: [{ type: "authenticated" }] },
        ]);
    });

    describe("groupMappings legacy-shape normalization", () => {
        it("converts { groupId } to { groupIds: [groupId] } and drops the legacy key", async () => {
            const doc = {
                _id: "authProviderConfig",
                memberOf: [],
                providers: {
                    "config-1": {
                        groupMappings: [
                            { groupId: "group-legacy", conditions: [{ type: "authenticated" }] },
                        ],
                    },
                },
            } as unknown as AuthProviderConfigDto;

            await processAuthProviderConfigDto(doc);

            const mapping = doc.providers["config-1"].groupMappings![0] as unknown as {
                groupId?: string;
                groupIds?: string[];
            };
            expect(mapping.groupIds).toEqual(["group-legacy"]);
            expect(mapping.groupId).toBeUndefined();
        });

        it("prefers existing groupIds when both keys are present and drops the stray groupId", async () => {
            const doc = {
                _id: "authProviderConfig",
                memberOf: [],
                providers: {
                    "config-1": {
                        groupMappings: [
                            {
                                groupId: "group-stale",
                                groupIds: ["group-new"],
                                conditions: [{ type: "authenticated" }],
                            },
                        ],
                    },
                },
            } as unknown as AuthProviderConfigDto;

            await processAuthProviderConfigDto(doc);

            const mapping = doc.providers["config-1"].groupMappings![0] as unknown as {
                groupId?: string;
                groupIds?: string[];
            };
            expect(mapping.groupIds).toEqual(["group-new"]);
            expect(mapping.groupId).toBeUndefined();
        });

        it("produces an empty groupIds array when neither key is present", async () => {
            const doc = {
                _id: "authProviderConfig",
                memberOf: [],
                providers: {
                    "config-1": {
                        groupMappings: [{ conditions: [{ type: "authenticated" }] }],
                    },
                },
            } as unknown as AuthProviderConfigDto;

            await processAuthProviderConfigDto(doc);

            expect(doc.providers["config-1"].groupMappings![0].groupIds).toEqual([]);
        });

        it("is a no-op when providers is missing", async () => {
            const doc = {
                _id: "authProviderConfig",
                memberOf: [],
            } as unknown as AuthProviderConfigDto;

            await expect(processAuthProviderConfigDto(doc)).resolves.toBeUndefined();
        });

        it("is a no-op when a provider's groupMappings is missing or not an array", async () => {
            const doc = {
                _id: "authProviderConfig",
                memberOf: [],
                providers: {
                    "config-1": { claimNamespace: "https://x/y" },
                    "config-2": { groupMappings: "not-an-array" },
                },
            } as unknown as AuthProviderConfigDto;

            await processAuthProviderConfigDto(doc);

            expect(doc.providers["config-1"]).toEqual({ claimNamespace: "https://x/y" });
            expect(
                (doc.providers["config-2"] as unknown as { groupMappings: unknown }).groupMappings,
            ).toBe("not-an-array");
        });
    });
});
