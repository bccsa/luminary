import { describe, expect, it, vi } from "vitest";
import { WebAuthFlowService } from "./auth-flow-web";

describe("WebAuthFlowService", () => {
    it("uses the page origin for both registered redirect URIs", () => {
        const service = new WebAuthFlowService();

        expect(service.redirectUri()).toBe(window.location.origin);
        expect(service.postLogoutRedirectUri()).toBe(window.location.origin);
        expect(service.signoutNavigates).toBe(true);
    });

    it("delegates interactive auth to OIDC's browser redirects", async () => {
        const service = new WebAuthFlowService();
        const signinRedirect = vi.fn().mockResolvedValue(undefined);
        const signoutRedirect = vi.fn().mockResolvedValue(undefined);
        const manager = { signinRedirect, signoutRedirect };
        const signinArgs = { prompt: "login" };
        const signoutArgs = { id_token_hint: "id-token" };

        await expect(service.signin(manager as never, signinArgs)).resolves.toBeNull();
        await service.signout(manager as never, signoutArgs);

        expect(signinRedirect).toHaveBeenCalledWith(signinArgs);
        expect(signoutRedirect).toHaveBeenCalledWith(signoutArgs);
    });
});
