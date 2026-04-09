import { AuthGuard } from "./auth.guard";
import { AuthIdentityService } from "./authIdentity.service";
import { PermissionSystem } from "../permissions/permissions.service";

describe("AuthGuard", () => {
    let guard: AuthGuard;
    let authIdentityService: Partial<AuthIdentityService>;

    const defaultGroups = ["group-public-users"];

    beforeEach(() => {
        authIdentityService = {
            resolveIdentity: jest.fn(),
            getDefaultGroups: jest.fn().mockResolvedValue(defaultGroups),
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
        (authIdentityService.resolveIdentity as jest.Mock).mockResolvedValue(userDetails);

        const context = createMockContext("Bearer valid-token", "provider-1");
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(context._request.user).toEqual(userDetails);
        expect(authIdentityService.resolveIdentity).toHaveBeenCalledWith("valid-token", "provider-1");
    });

    it("should fall back to default groups when no Authorization header", async () => {
        const context = createMockContext(undefined);
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(context._request.user.groups).toEqual(defaultGroups);
        expect(context._request.user.accessMap).toBeDefined();
    });

    it("should fall back to default groups for non-Bearer token", async () => {
        const context = createMockContext("Basic abc123", "provider-1");
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(context._request.user.groups).toEqual(defaultGroups);
    });

    it("should fall back to default groups when identity resolution fails", async () => {
        (authIdentityService.resolveIdentity as jest.Mock).mockRejectedValue(
            new Error("Token expired"),
        );
        const context = createMockContext("Bearer expired-token", "provider-1");
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(context._request.user.groups).toEqual(defaultGroups);
    });

    it("should fall back to default groups when no provider ID is given", async () => {
        const context = createMockContext("Bearer some-token");
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(context._request.user.groups).toEqual(defaultGroups);
        expect(authIdentityService.resolveIdentity).not.toHaveBeenCalled();
    });
});
