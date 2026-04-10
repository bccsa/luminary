import { AuthGuard } from "./auth.guard";
import { AuthIdentityService } from "./authIdentity.service";
import type { IdentityResult } from "./authIdentity.service";

describe("AuthGuard", () => {
    let guard: AuthGuard;
    let authIdentityService: Partial<AuthIdentityService>;

    const defaultUserDetails = {
        groups: ["group-public-users"],
        accessMap: new Map(),
    };

    beforeEach(() => {
        authIdentityService = {
            resolveOrDefault: jest.fn(),
        };
        guard = new AuthGuard(authIdentityService as AuthIdentityService);
    });

    function createMockContext(authHeader?: string, providerId?: string) {
        const request: any = {
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

    it("should fall back to default groups when identity resolution fails", async () => {
        (authIdentityService.resolveOrDefault as jest.Mock).mockResolvedValue({
            status: "error",
            userDetails: defaultUserDetails,
            error: new Error("Token expired"),
        } as IdentityResult);

        const context = createMockContext("Bearer expired-token", "provider-1");
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(context._request.user).toEqual(defaultUserDetails);
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
        expect(authIdentityService.resolveOrDefault).toHaveBeenCalledWith(
            "some-token",
            undefined,
        );
    });
});
