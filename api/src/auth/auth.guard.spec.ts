import { ConfigService } from "@nestjs/config";
import { AuthGuard } from "./auth.guard";
import { IdentityCacheService } from "./identityCache.service";
import type { IdentityResult } from "./authIdentity.service";

describe("AuthGuard", () => {
    let guard: AuthGuard;
    // The guard resolves through IdentityCacheService; the mock exposes its resolveOrDefault.
    let authIdentityService: Partial<IdentityCacheService>;

    const defaultUserDetails = {
        groups: ["group-public-users"],
        accessMap: new Map(),
    };

    beforeEach(() => {
        authIdentityService = {
            resolveOrDefault: jest.fn(),
        };
        guard = new AuthGuard(
            authIdentityService as IdentityCacheService,
            new ConfigService({ userData: { idSecret: "secret" } }),
        );
    });

    function createMockContext(authHeader?: string, providerId?: string) {
        const request: any = {
            ip: "127.0.0.1",
            headers: {
                authorization: authHeader,
                "x-auth-provider-id": providerId,
            },
        };
        return {
            switchToHttp: () => ({
                getRequest: () => request,
            }),
            _request: request,
        } as any;
    }

    it("should return true and set user for a valid Bearer token with provider", async () => {
        const userDetails = { groups: ["group-admins"], userId: "user-1" };
        (authIdentityService.resolveOrDefault as jest.Mock).mockResolvedValue({
            status: "authenticated",
            userDetails,
        } as IdentityResult);

        const context = createMockContext("Bearer valid-token", "provider-1");
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(context._request.user).toEqual(userDetails);
        expect(authIdentityService.resolveOrDefault).toHaveBeenCalledWith(
            "valid-token",
            "provider-1",
        );
    });

    it("should fall back to default groups when no Authorization header", async () => {
        (authIdentityService.resolveOrDefault as jest.Mock).mockResolvedValue({
            status: "anonymous",
            userDetails: defaultUserDetails,
        } as IdentityResult);

        const context = createMockContext(undefined);
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(context._request.user).toEqual(defaultUserDetails);
    });

    it("should fall back to default groups for non-Bearer token", async () => {
        (authIdentityService.resolveOrDefault as jest.Mock).mockResolvedValue({
            status: "anonymous",
            userDetails: defaultUserDetails,
        } as IdentityResult);

        const context = createMockContext("Basic abc123", "provider-1");
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(context._request.user).toEqual(defaultUserDetails);
    });

    it("should propagate UnauthorizedException when identity resolution fails", async () => {
        const { UnauthorizedException } = await import("@nestjs/common");
        (authIdentityService.resolveOrDefault as jest.Mock).mockRejectedValue(
            new UnauthorizedException("Token expired"),
        );

        const context = createMockContext("Bearer expired-token", "provider-1");

        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("should fall back to default groups when no provider ID is given", async () => {
        (authIdentityService.resolveOrDefault as jest.Mock).mockResolvedValue({
            status: "anonymous",
            userDetails: defaultUserDetails,
        } as IdentityResult);

        const context = createMockContext("Bearer some-token");
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(context._request.user).toEqual(defaultUserDetails);
        expect(authIdentityService.resolveOrDefault).toHaveBeenCalledWith("some-token", undefined);
    });

    it("resolves owner and allowance from authenticated details instead of request-body claims", async () => {
        const userDetails = {
            groups: [],
            jwtPayload: { iss: "https://issuer.example", sub: "subject-123" },
        };
        (authIdentityService.resolveOrDefault as jest.Mock).mockResolvedValue({
            status: "authenticated",
            userDetails,
        });
        const context = createMockContext("Bearer valid-token", "provider-1");
        context._request.body = { ownerKey: "forged", rateLimitKey: "forged", sub: "forged" };
        await guard.canActivate(context);
        expect(context._request.authIdentity).toMatchObject({
            authenticated: true,
            account: { issuer: "https://issuer.example", subject: "subject-123" },
            ownerKey: expect.stringMatching(/^[a-f0-9]{64}$/),
            rateLimitKey: expect.stringMatching(/^jwt:[a-f0-9]{64}$/),
        });
    });

    it("marks anonymous auth results independently of fields in the user details", async () => {
        (authIdentityService.resolveOrDefault as jest.Mock).mockResolvedValue({
            status: "anonymous",
            userDetails: { groups: [], userId: "unexpected-user" },
        });
        const context = createMockContext();
        await guard.canActivate(context);
        expect(context._request.authIdentity).toMatchObject({
            authenticated: false,
            rateLimitKey: "ip:127.0.0.1",
        });
        expect(context._request.authIdentity.ownerKey).toBeUndefined();
    });
});
