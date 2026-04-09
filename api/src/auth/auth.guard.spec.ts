import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthGuard } from "./auth.guard";

describe("AuthGuard", () => {
    let guard: AuthGuard;
    let jwtService: JwtService;

    beforeEach(() => {
        jwtService = {
            verifyAsync: jest.fn(),
        } as any;
        guard = new AuthGuard(jwtService);
    });

    function createMockContext(authHeader?: string) {
        const request: any = {
            headers: {
                authorization: authHeader,
            },
        };
        return {
            switchToHttp: () => ({
                getRequest: () => request,
            }),
            _request: request,
        } as any;
    }

    it("should return true and set user for a valid Bearer token", async () => {
        const payload = { userId: "123", role: "admin" };
        (jwtService.verifyAsync as jest.Mock).mockResolvedValue(payload);

        const context = createMockContext("Bearer valid-token");
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(context._request.user).toEqual(payload);
        expect(jwtService.verifyAsync).toHaveBeenCalledWith("valid-token", {
            secret: process.env.JWT_SECRET,
        });
    });

    it("should throw UnauthorizedException when no Authorization header", async () => {
        const context = createMockContext(undefined);
        await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it("should throw UnauthorizedException for non-Bearer token", async () => {
        const context = createMockContext("Basic abc123");
        await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it("should throw UnauthorizedException when JWT verification fails", async () => {
        (jwtService.verifyAsync as jest.Mock).mockRejectedValue(new Error("Token expired"));
        const context = createMockContext("Bearer expired-token");
        await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it("should throw UnauthorizedException for empty Bearer token", async () => {
        const context = createMockContext("Bearer ");
        // "Bearer ".split(" ") => ["Bearer", ""] => token is empty string which is falsy
        await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
});
