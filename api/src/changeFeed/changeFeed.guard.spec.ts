import { UnauthorizedException } from "@nestjs/common";
import { ChangeFeedAuthGuard } from "./changeFeed.guard";

describe("ChangeFeedAuthGuard", () => {
    function ctx(headers: Record<string, string>) {
        const request: any = { headers };
        return { request, context: { switchToHttp: () => ({ getRequest: () => request }) } as any };
    }

    it("attaches the resolved user", async () => {
        const auth: any = {
            resolveOrDefault: jest.fn().mockResolvedValue({ userDetails: { groups: [] } }),
        };
        const { request, context } = ctx({ authorization: "Bearer t", "x-auth-provider-id": "p" });
        await expect(new ChangeFeedAuthGuard(auth).canActivate(context)).resolves.toBe(true);
        expect(auth.resolveOrDefault).toHaveBeenCalledWith("t", "p");
        expect(request.user).toEqual({ groups: [] });
    });

    it("allows anonymous access", async () => {
        const auth: any = {
            resolveOrDefault: jest.fn().mockResolvedValue({ userDetails: { groups: ["g"] } }),
        };
        const { context } = ctx({});
        await expect(new ChangeFeedAuthGuard(auth).canActivate(context)).resolves.toBe(true);
    });

    it("rejects a token without a providerId as provider_not_found", async () => {
        const auth: any = { resolveOrDefault: jest.fn() };
        const { context } = ctx({ authorization: "Bearer t" });
        const err: any = await new ChangeFeedAuthGuard(auth).canActivate(context).catch((e) => e);
        expect(err).toBeInstanceOf(UnauthorizedException);
        expect(err.getResponse()).toMatchObject({
            type: "auth_failed",
            reason: "provider_not_found",
        });
    });

    it("passes the failure reason from the identity service through the 401 body", async () => {
        const failure: any = new Error("x");
        failure.reason = "token_invalid";
        const auth: any = { resolveOrDefault: jest.fn().mockRejectedValue(failure) };
        const { context } = ctx({ authorization: "Bearer t", "x-auth-provider-id": "p" });
        const err: any = await new ChangeFeedAuthGuard(auth).canActivate(context).catch((e) => e);
        expect(err.getResponse()).toMatchObject({ type: "auth_failed", reason: "token_invalid" });
    });
});
