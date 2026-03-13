import { AuthIdentityService } from "./authIdentity.service";
import { AuthProviderGroupMapping } from "../dto/AuthProviderDto";
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
            const mappings: AuthProviderGroupMapping[] = [
                { groupId: "group-auth", conditions: [{ type: "authenticated" }] },
            ];
            expect(service.evaluateGroupAssignments({}, mappings)).toContain("group-auth");
        });

        it("should handle 'claimEquals' properly", () => {
            const mappings: AuthProviderGroupMapping[] = [
                {
                    groupId: "group-admin",
                    conditions: [{ type: "claimEquals", claimPath: "role", value: "admin" }],
                },
            ];
            expect(service.evaluateGroupAssignments({ role: "admin" }, mappings)).toContain("group-admin");
            expect(service.evaluateGroupAssignments({ role: "editor" }, mappings)).not.toContain("group-admin");
        });

        it("should handle 'claimIn' when claim is a single string", () => {
            const mappings: AuthProviderGroupMapping[] = [
                {
                    groupId: "group-staff",
                    conditions: [{ type: "claimIn", claimPath: "department", values: ["sales", "it"] }],
                },
            ];
            expect(service.evaluateGroupAssignments({ department: "it" }, mappings)).toContain("group-staff");
            expect(service.evaluateGroupAssignments({ department: "hr" }, mappings)).not.toContain("group-staff");
        });

        it("should handle 'claimIn' when claim is an array", () => {
            const mappings: AuthProviderGroupMapping[] = [
                {
                    groupId: "group-managers",
                    conditions: [{ type: "claimIn", claimPath: "roles", values: ["manager", "supervisor"] }],
                },
            ];
            expect(
                service.evaluateGroupAssignments({ roles: ["employee", "supervisor"] }, mappings),
            ).toContain("group-managers");
            expect(
                service.evaluateGroupAssignments({ roles: ["employee", "intern"] }, mappings),
            ).not.toContain("group-managers");
        });

        it("should support OR logic for a single group with multiple conditions", () => {
            const mappings: AuthProviderGroupMapping[] = [
                {
                    groupId: "group-or",
                    conditions: [
                        { type: "claimEquals", claimPath: "department", value: "executive" },
                        { type: "claimEquals", claimPath: "title", value: "ceo" },
                    ],
                },
            ];
            expect(
                service.evaluateGroupAssignments({ department: "executive", title: "cfo" }, mappings),
            ).toContain("group-or");
            expect(
                service.evaluateGroupAssignments({ department: "sales", title: "ceo" }, mappings),
            ).toContain("group-or");
            expect(
                service.evaluateGroupAssignments({ department: "sales", title: "representative" }, mappings),
            ).not.toContain("group-or");
        });
    });

    // ── getDefaultGroups ─────────────────────────────────────────────────────────

    describe("getDefaultGroups", () => {
        it("should return defaultGroups from GlobalConfig document", async () => {
            (service as any).dbService = {
                executeFindQuery: jest.fn().mockResolvedValue({
                    docs: [{ type: DocType.GlobalConfig, defaultGroups: ["group-public"] }],
                }),
            };
            const groups = await service.getDefaultGroups();
            expect(groups).toEqual(["group-public"]);
        });

        it("should return [] when no GlobalConfig document exists", async () => {
            (service as any).dbService = {
                executeFindQuery: jest.fn().mockResolvedValue({ docs: [] }),
            };
            const groups = await service.getDefaultGroups();
            expect(groups).toEqual([]);
        });

        it("should cache the result and not re-query within TTL", async () => {
            const mockQuery = jest.fn().mockResolvedValue({
                docs: [{ type: DocType.GlobalConfig, defaultGroups: ["group-public"] }],
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
import { UnauthorizedException } from "@nestjs/common";

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

    it("should throw UnauthorizedException when no email in token and no user found by identity", async () => {
        mockJwtService.verifyAsync = jest.fn().mockResolvedValue({ sub: "auth0|123" }); // no email

        mockDbService.executeFindQuery
            .mockResolvedValueOnce({ docs: [] }) // GlobalConfig
            .mockResolvedValueOnce({ docs: [] }); // identity lookup – no match; email fallback skipped

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

        await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it("should provision a new user when no matching identity or email exists", async () => {
        mockDbService.executeFindQuery
            .mockResolvedValueOnce({ docs: [{ defaultGroups: ["group-public"] }] }) // GlobalConfig
            .mockResolvedValueOnce({ docs: [] }) // identity lookup – no match
            .mockResolvedValueOnce({ docs: [] }); // email lookup – no match

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
                _id: "new-user-uuid",
                email: "test@bccsa.org",
                identities: [{ providerId: "provider-id", externalUserId: "auth0|123" }],
            }),
        );
    });

    it("should link identity to existing user found by email (fallback)", async () => {
        const existingUser = {
            _id: "user-123",
            _rev: "1-abc",
            email: "test@bccsa.org",
            name: "Test User",
            memberOf: ["group-members"],
            identities: [],
        };

        mockDbService.executeFindQuery
            .mockResolvedValueOnce({ docs: [{ defaultGroups: [] }] }) // GlobalConfig
            .mockResolvedValueOnce({ docs: [] }) // identity lookup – no match
            .mockResolvedValueOnce({ docs: [existingUser] }); // email lookup – found

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
                identities: [{ providerId: "provider-id", externalUserId: "auth0|123" }],
            }),
        );
    });

    it("should resolve identity directly when found by externalUserId", async () => {
        const existingUser = {
            _id: "user-456",
            _rev: "1-def",
            email: "test@bccsa.org",
            name: "Test User",
            memberOf: ["group-members"],
            identities: [{ providerId: "provider-id", externalUserId: "auth0|123" }],
        };

        mockDbService.executeFindQuery
            .mockResolvedValueOnce({ docs: [{ defaultGroups: ["group-public"] }] }) // GlobalConfig
            .mockResolvedValueOnce({ docs: [existingUser] }); // identity lookup – found

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
            identities: [{ providerId: "provider-id", externalUserId: "auth0|123" }],
        };

        mockDbService.executeFindQuery
            .mockResolvedValueOnce({ docs: [{ defaultGroups: ["group-public"] }] }) // GlobalConfig
            .mockResolvedValueOnce({ docs: [existingUser] }); // identity lookup

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
                        set(val) { capturedUser = val; },
                        get() { return capturedUser; },
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
});
