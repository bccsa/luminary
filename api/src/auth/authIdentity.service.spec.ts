import { AuthIdentityService } from "./authIdentity.service";
import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { DbService } from "../db/db.service";
import { DocType } from "../enums";

jest.mock("uuid", () => ({ v4: jest.fn().mockReturnValue("new-user-uuid") }));

describe("AuthIdentityService", () => {
    let service: AuthIdentityService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthIdentityService,
                { provide: JwtService, useValue: {} },
                { provide: DbService, useValue: {} },
            ],
        }).compile();

        service = module.get<AuthIdentityService>(AuthIdentityService);
    });

    it("should be defined", () => {
        expect(service).toBeDefined();
    });

    // ── extractClaimValue ────────────────────────────────────────────────────────

    describe("extractClaimValue", () => {
        it("should return exact match first (useful for namespaced claims)", () => {
            const payload = {
                "https://example.org/roles": ["admin"],
                https: { example: { "org/roles": "wrong" } },
            };
            const result = service.extractClaimValue(payload, "https://example.org/roles");
            expect(result).toEqual(["admin"]);
        });

        it("should fall back to deeply nested dot notation if exact match fails", () => {
            const payload = {
                user: { profile: { metadata: { role: "editor" } } },
            };
            const result = service.extractClaimValue(payload, "user.profile.metadata.role");
            expect(result).toBe("editor");
        });

        it("should return undefined if the path does not exist", () => {
            const payload = { user: { name: "Test" } };
            const result = service.extractClaimValue(payload, "user.profile.role");
            expect(result).toBeUndefined();
        });

        it("should handle nullish payload gracefully", () => {
            expect(service.extractClaimValue(null, "path")).toBeUndefined();
            expect(service.extractClaimValue(undefined, "path")).toBeUndefined();
        });
    });

    // ── evaluateGroupAssignments ─────────────────────────────────────────────────

    describe("evaluateGroupAssignments", () => {
        it("should assign group if 'authenticated' condition is met", () => {
            const mappings: any = [
                { _id: "m1", groupIds: ["group-auth"], conditions: [{ type: "authenticated" }] },
            ];
            expect(service.evaluateGroupAssignments({}, mappings)).toContain("group-auth");
        });

        it("should handle 'claimEquals' properly", () => {
            const mappings: any = [
                {
                    _id: "m1",
                    groupIds: ["group-admin"],
                    conditions: [{ type: "claimEquals", claimPath: "role", value: "admin" }],
                },
            ];
            expect(service.evaluateGroupAssignments({ role: "admin" }, mappings)).toContain(
                "group-admin",
            );
            expect(service.evaluateGroupAssignments({ role: "editor" }, mappings)).not.toContain(
                "group-admin",
            );
        });

        it("should handle 'claimIn' when claim is a single string", () => {
            const mappings: any = [
                {
                    _id: "m1",
                    groupIds: ["group-staff"],
                    conditions: [
                        { type: "claimIn", claimPath: "department", values: ["sales", "it"] },
                    ],
                },
            ];
            expect(service.evaluateGroupAssignments({ department: "it" }, mappings)).toContain(
                "group-staff",
            );
            expect(service.evaluateGroupAssignments({ department: "hr" }, mappings)).not.toContain(
                "group-staff",
            );
        });

        it("should handle 'claimIn' when claim is an array", () => {
            const mappings: any = [
                {
                    _id: "m1",
                    groupIds: ["group-managers"],
                    conditions: [
                        { type: "claimIn", claimPath: "roles", values: ["manager", "supervisor"] },
                    ],
                },
            ];
            expect(
                service.evaluateGroupAssignments({ roles: ["employee", "supervisor"] }, mappings),
            ).toContain("group-managers");
            expect(
                service.evaluateGroupAssignments({ roles: ["employee", "intern"] }, mappings),
            ).not.toContain("group-managers");
        });

        it("should support AND logic for a single group with multiple conditions", () => {
            const mappings: any = [
                {
                    _id: "m1",
                    groupIds: ["group-and"],
                    conditions: [
                        { type: "claimEquals", claimPath: "department", value: "executive" },
                        { type: "claimEquals", claimPath: "title", value: "ceo" },
                    ],
                },
            ];
            expect(
                service.evaluateGroupAssignments(
                    { department: "executive", title: "ceo" },
                    mappings,
                ),
            ).toContain("group-and");
            expect(
                service.evaluateGroupAssignments(
                    { department: "executive", title: "cfo" },
                    mappings,
                ),
            ).not.toContain("group-and");
            expect(
                service.evaluateGroupAssignments({ department: "sales", title: "ceo" }, mappings),
            ).not.toContain("group-and");
        });

        it("should assign every group in groupIds when the mapping matches", () => {
            const mappings: any = [
                {
                    _id: "m1",
                    groupIds: ["group-editors", "group-reviewers"],
                    conditions: [{ type: "claimEquals", claimPath: "role", value: "editor" }],
                },
            ];
            const assigned = service.evaluateGroupAssignments({ role: "editor" }, mappings);
            expect(assigned).toEqual(
                expect.arrayContaining(["group-editors", "group-reviewers"]),
            );
            expect(assigned).toHaveLength(2);
        });

        it("should de-duplicate across mappings assigning the same group", () => {
            const mappings: any = [
                {
                    _id: "m1",
                    groupIds: ["group-shared"],
                    conditions: [{ type: "claimEquals", claimPath: "role", value: "editor" }],
                },
                {
                    _id: "m1",
                    groupIds: ["group-shared", "group-extra"],
                    conditions: [{ type: "authenticated" }],
                },
            ];
            const assigned = service.evaluateGroupAssignments({ role: "editor" }, mappings);
            expect(assigned.sort()).toEqual(["group-extra", "group-shared"]);
        });

        it("should skip mappings with empty groupIds and no legacy fallback", () => {
            const mappings: any = [
                { _id: "m1", groupIds: [], conditions: [{ type: "authenticated" }] },
            ];
            expect(service.evaluateGroupAssignments({}, mappings)).toEqual([]);
        });
    });

    // ── getDefaultGroups ─────────────────────────────────────────────────────────

    describe("getDefaultGroups", () => {
        it("should return groups from provider-less AutoGroupMappings documents", async () => {
            (service as any).dbService = {
                executeFindQuery: jest.fn().mockResolvedValue({
                    docs: [
                        { type: DocType.AutoGroupMappings, groupIds: ["group-public"], providerId: "" },
                    ],
                }),
            };
            const groups = await service.getDefaultGroups();
            expect(groups).toEqual(["group-public"]);
        });

        it("should merge groups from multiple provider-less mappings", async () => {
            (service as any).dbService = {
                executeFindQuery: jest.fn().mockResolvedValue({
                    docs: [
                        { type: DocType.AutoGroupMappings, groupIds: ["group-a"], providerId: "" },
                        { type: DocType.AutoGroupMappings, groupIds: ["group-a", "group-b"] },
                    ],
                }),
            };
            const groups = await service.getDefaultGroups();
            expect(groups.sort()).toEqual(["group-a", "group-b"]);
        });

        it("should return [] when no provider-less mappings exist", async () => {
            (service as any).dbService = {
                executeFindQuery: jest.fn().mockResolvedValue({ docs: [] }),
            };
            const groups = await service.getDefaultGroups();
            expect(groups).toEqual([]);
        });

        it("should cache the result and not re-query", async () => {
            const mockQuery = jest.fn().mockResolvedValue({
                docs: [
                    { type: DocType.AutoGroupMappings, groupIds: ["group-public"], providerId: "" },
                ],
            });
            (service as any).dbService = { executeFindQuery: mockQuery };

            await service.getDefaultGroups();
            await service.getDefaultGroups();

            expect(mockQuery).toHaveBeenCalledTimes(1);
        });
    });
});

// ── AuthGuard integration ────────────────────────────────────────────────────

import { AuthGuard } from "./auth.guard";

jest.mock("jwks-rsa", () => {
    return Object.assign(
        jest.fn().mockImplementation(() => ({
            getSigningKey: jest.fn().mockResolvedValue({ getPublicKey: () => "mock_pub_key" }),
        })),
        { default: jest.fn() },
    );
});

describe("AuthGuard (Integrated)", () => {
    let guard: AuthGuard;
    let mockJwtService: any;
    let mockDbService: any;
    let authIdentityService: AuthIdentityService;

    const baseProviderDoc = {
        domain: "bccsa.eu.auth0.com",
        audience: "https://api.bccsa.org",
        groupMappings: [],
    };

    beforeEach(() => {
        mockJwtService = {
            decode: jest.fn().mockReturnValue({ header: { kid: "mock-kid" } }),
            verifyAsync: jest.fn().mockResolvedValue({ sub: "auth0|123", email: "test@bccsa.org" }),
        };

        mockDbService = {
            getDoc: jest.fn().mockResolvedValue({ docs: [baseProviderDoc] }),
            executeFindQuery: jest.fn(),
            upsertDoc: jest.fn().mockResolvedValue({}),
        };

        authIdentityService = new AuthIdentityService(mockJwtService, mockDbService);
        guard = new AuthGuard(authIdentityService);
    });

    it("should fall back to default groups when no email in token and no user found by identity", async () => {
        mockJwtService.verifyAsync = jest.fn().mockResolvedValue({ sub: "auth0|123" }); // no email

        mockDbService.executeFindQuery
            .mockResolvedValueOnce({ docs: [] }) // getDefaultGroups (provider-less AutoGroupMappings)
            .mockResolvedValueOnce({ docs: [] }) // getAutoGroupMappings(providerId)
            .mockResolvedValueOnce({ docs: [] }) // userId lookup – no match
            .mockResolvedValueOnce({ docs: [] }); // externalUserId lookup – no match; email fallback skipped

        let capturedUser: any;
        const mockContext = {
            switchToHttp: () => ({
                getRequest: () => {
                    const req: any = {
                        headers: {
                            authorization: "Bearer valid-token",
                            "x-auth-provider-id": "provider-id",
                        },
                    };
                    Object.defineProperty(req, "user", {
                        set(val) {
                            capturedUser = val;
                        },
                        get() {
                            return capturedUser;
                        },
                    });
                    return req;
                },
            }),
        } as any;

        const result = await guard.canActivate(mockContext);
        expect(result).toBe(true);
        expect(capturedUser).toBeDefined();
        expect(capturedUser.groups).toEqual([]);
    });

    it("should fall back to default groups when no matching identity or email exists", async () => {
        mockJwtService.verifyAsync = jest
            .fn()
            .mockResolvedValue({ sub: "auth0|123", email: "test@bccsa.org", email_verified: true });

        mockDbService.executeFindQuery
            .mockResolvedValueOnce({ docs: [{ groupIds: ["group-public"], type: "autoGroupMappings" }] }) // getDefaultGroups (provider-less AutoGroupMappings)
            .mockResolvedValueOnce({ docs: [] }) // getAutoGroupMappings(providerId)
            .mockResolvedValueOnce({ docs: [] }) // userId lookup – no match
            .mockResolvedValueOnce({ docs: [] }) // externalUserId lookup – no match
            .mockResolvedValueOnce({ docs: [] }); // email lookup – no match

        let capturedUser: any;
        const mockContext = {
            switchToHttp: () => ({
                getRequest: () => {
                    const req: any = {
                        headers: {
                            authorization: "Bearer valid-token",
                            "x-auth-provider-id": "provider-id",
                        },
                    };
                    Object.defineProperty(req, "user", {
                        set(val) {
                            capturedUser = val;
                        },
                        get() {
                            return capturedUser;
                        },
                    });
                    return req;
                },
            }),
        } as any;

        const result = await guard.canActivate(mockContext);
        expect(result).toBe(true);
        expect(capturedUser).toBeDefined();
        expect(capturedUser.groups).toEqual(expect.arrayContaining(["group-public"]));
        expect(mockDbService.upsertDoc).not.toHaveBeenCalled();
    });

    it("should link identity to existing user found by email (fallback) when email is verified", async () => {
        mockJwtService.verifyAsync = jest
            .fn()
            .mockResolvedValue({ sub: "auth0|123", email: "test@bccsa.org", email_verified: true });

        const existingUser = {
            _id: "user-123",
            _rev: "1-abc",
            email: "test@bccsa.org",
            name: "Test User",
            memberOf: ["group-members"],
        };

        mockDbService.executeFindQuery
            .mockResolvedValueOnce({ docs: [{ groupIds: [], type: "autoGroupMappings" }] }) // getDefaultGroups (provider-less AutoGroupMappings)
            .mockResolvedValueOnce({ docs: [] }) // getAutoGroupMappings(providerId)
            .mockResolvedValueOnce({ docs: [] }) // userId lookup – no match
            .mockResolvedValueOnce({ docs: [] }) // externalUserId lookup – no match
            .mockResolvedValueOnce({ docs: [existingUser] }) // email lookup – found
            .mockResolvedValueOnce({ docs: [existingUser] }); // email merge query

        const mockContext = {
            switchToHttp: () => ({
                getRequest: () => ({
                    headers: {
                        authorization: "Bearer valid-token",
                        "x-auth-provider-id": "provider-id",
                    },
                }),
            }),
        } as any;

        const result = await guard.canActivate(mockContext);
        expect(result).toBe(true);
        expect(mockDbService.upsertDoc).toHaveBeenCalledWith(
            expect.objectContaining({
                _id: "user-123",
                externalUserId: "auth0|123",
            }),
        );
    });

    it("should resolve identity when found by userId (admin-set legacy field)", async () => {
        const existingUser = {
            _id: "user-legacy",
            _rev: "1-xyz",
            email: "test@bccsa.org",
            name: "Test User",
            memberOf: ["group-members"],
            userId: "auth0|123",
        };

        mockDbService.executeFindQuery
            .mockResolvedValueOnce({ docs: [{ groupIds: ["group-public"], type: "autoGroupMappings" }] }) // getDefaultGroups (provider-less AutoGroupMappings)
            .mockResolvedValueOnce({ docs: [] }) // getAutoGroupMappings(providerId)
            .mockResolvedValueOnce({ docs: [existingUser] }) // userId lookup – found
            .mockResolvedValueOnce({ docs: [existingUser] }); // email merge query

        const mockContext = {
            switchToHttp: () => ({
                getRequest: () => ({
                    headers: {
                        authorization: "Bearer valid-token",
                        "x-auth-provider-id": "provider-id",
                    },
                }),
            }),
        } as any;

        const result = await guard.canActivate(mockContext);
        expect(result).toBe(true);
        expect(mockDbService.upsertDoc).toHaveBeenCalledTimes(1);
        expect(mockDbService.upsertDoc).toHaveBeenCalledWith(
            expect.objectContaining({ _id: "user-legacy", externalUserId: "auth0|123" }),
        );
    });

    it("should resolve identity directly when found by externalUserId", async () => {
        const existingUser = {
            _id: "user-456",
            _rev: "1-def",
            email: "test@bccsa.org",
            name: "Test User",
            memberOf: ["group-members"],
            providerId: "provider-id",
            externalUserId: "auth0|123",
        };

        mockDbService.executeFindQuery
            .mockResolvedValueOnce({ docs: [{ groupIds: ["group-public"], type: "autoGroupMappings" }] }) // getDefaultGroups (provider-less AutoGroupMappings)
            .mockResolvedValueOnce({ docs: [] }) // getAutoGroupMappings(providerId)
            .mockResolvedValueOnce({ docs: [] }) // userId lookup – no match
            .mockResolvedValueOnce({ docs: [existingUser] }) // externalUserId lookup – found
            .mockResolvedValueOnce({ docs: [existingUser] }); // email merge query

        const mockContext = {
            switchToHttp: () => ({
                getRequest: () => ({
                    headers: {
                        authorization: "Bearer valid-token",
                        "x-auth-provider-id": "provider-id",
                    },
                }),
            }),
        } as any;

        const result = await guard.canActivate(mockContext);
        expect(result).toBe(true);
        // upsertDoc called once – lastLogin update for existing user (_rev present)
        expect(mockDbService.upsertDoc).toHaveBeenCalledTimes(1);
        expect(mockDbService.upsertDoc).toHaveBeenCalledWith(
            expect.objectContaining({ _id: "user-456" }),
        );
    });

    it("should merge defaultGroups, dynamicGroups and staticGroups without duplicates", async () => {
        const existingUser = {
            _id: "user-789",
            _rev: "1-ghi",
            email: "test@bccsa.org",
            name: "Test User",
            memberOf: ["group-public", "group-private"], // group-public duplicated with defaultGroups
            providerId: "provider-id",
            externalUserId: "auth0|123",
        };

        mockDbService.executeFindQuery
            .mockResolvedValueOnce({ docs: [{ groupIds: ["group-public"], type: "autoGroupMappings" }] }) // getDefaultGroups (provider-less AutoGroupMappings)
            .mockResolvedValueOnce({ docs: [] }) // getAutoGroupMappings(providerId)
            .mockResolvedValueOnce({ docs: [] }) // userId lookup – no match
            .mockResolvedValueOnce({ docs: [existingUser] }) // externalUserId lookup
            .mockResolvedValueOnce({ docs: [existingUser] }); // email merge query

        let capturedUser: any;
        const mockContext = {
            switchToHttp: () => ({
                getRequest: () => {
                    const req: any = {
                        headers: {
                            authorization: "Bearer valid-token",
                            "x-auth-provider-id": "provider-id",
                        },
                    };
                    Object.defineProperty(req, "user", {
                        set(val) {
                            capturedUser = val;
                        },
                        get() {
                            return capturedUser;
                        },
                    });
                    return req;
                },
            }),
        } as any;

        await guard.canActivate(mockContext);
        const groups: string[] = capturedUser?.groups ?? [];
        // group-public appears in defaultGroups and memberOf – must appear only once
        expect(groups.filter((g) => g === "group-public")).toHaveLength(1);
        expect(groups).toContain("group-private");
    });

    it("should merge memberOf from multiple user docs with the same email", async () => {
        mockJwtService.verifyAsync = jest
            .fn()
            .mockResolvedValue({ sub: "auth0|123", email: "test@bccsa.org", email_verified: true });

        const userDoc1 = {
            _id: "user-a",
            _rev: "1-aaa",
            email: "test@bccsa.org",
            name: "Test User",
            memberOf: ["group-editors"],
        };
        const userDoc2 = {
            _id: "user-b",
            _rev: "1-bbb",
            email: "test@bccsa.org",
            name: "Test User",
            memberOf: ["group-admins", "group-editors"], // group-editors duplicated
        };

        mockDbService.executeFindQuery
            .mockResolvedValueOnce({ docs: [{ groupIds: [], type: "autoGroupMappings" }] }) // getDefaultGroups (provider-less AutoGroupMappings)
            .mockResolvedValueOnce({ docs: [] }) // getAutoGroupMappings(providerId)
            .mockResolvedValueOnce({ docs: [] }) // userId lookup – no match
            .mockResolvedValueOnce({ docs: [] }) // externalUserId lookup – no match
            .mockResolvedValueOnce({ docs: [userDoc1] }) // email lookup – first doc
            .mockResolvedValueOnce({ docs: [userDoc1, userDoc2] }); // email merge query – both docs

        let capturedUser: any;
        const mockContext = {
            switchToHttp: () => ({
                getRequest: () => {
                    const req: any = {
                        headers: {
                            authorization: "Bearer valid-token",
                            "x-auth-provider-id": "provider-id",
                        },
                    };
                    Object.defineProperty(req, "user", {
                        set(val) {
                            capturedUser = val;
                        },
                        get() {
                            return capturedUser;
                        },
                    });
                    return req;
                },
            }),
        } as any;

        await guard.canActivate(mockContext);
        const groups: string[] = capturedUser?.groups ?? [];
        expect(groups).toContain("group-editors");
        expect(groups).toContain("group-admins");
        // group-editors appears in both docs – must appear only once
        expect(groups.filter((g) => g === "group-editors")).toHaveLength(1);
    });
});
