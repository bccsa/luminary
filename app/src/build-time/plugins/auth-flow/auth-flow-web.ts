import type { SigninRedirectArgs, SignoutRedirectArgs, User, UserManager } from "oidc-client-ts";
import type { AuthFlowService } from "@/build-time/contracts/auth-flow/contract";

/**
 * Browser {@link AuthFlowService}: full-page redirects. The provider returns
 * to the origin, where boot-time callback handling completes the signin.
 */
export class WebAuthFlowService implements AuthFlowService {
    readonly signoutNavigates = true;

    redirectUri(): string {
        return window.location.origin;
    }

    postLogoutRedirectUri(): string {
        return window.location.origin;
    }

    async signin(manager: UserManager, args: SigninRedirectArgs): Promise<User | null> {
        // Navigation takes over; the resolved value is never used on this page.
        await manager.signinRedirect(args);
        return null;
    }

    async signout(manager: UserManager, args: SignoutRedirectArgs): Promise<void> {
        await manager.signoutRedirect(args);
    }
}
