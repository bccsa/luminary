import type { SigninRedirectArgs, SignoutRedirectArgs, User, UserManager } from "oidc-client-ts";

/**
 * How the interactive OIDC round trips run on this platform. A browser leaves
 * the page and returns on the registered redirect URI; the packaged app runs
 * the whole exchange in a system auth session and stays loaded throughout.
 */
export type AuthFlowService = {
    /** Redirect URI registered with the provider for this platform. */
    redirectUri(providerDomain: string): string;

    /** Post-logout redirect URI registered with the provider. */
    postLogoutRedirectUri(providerDomain: string): string;

    /** True when signout navigates away from the page (the SPA reboots on return). */
    readonly signoutNavigates: boolean;

    /**
     * Interactive authorization-code signin. Resolves with the signed-in user
     * when the flow completes in place; null when navigation is taking over or
     * the user cancelled.
     */
    signin(manager: UserManager, args: SigninRedirectArgs): Promise<User | null>;

    /** Interactive signout against the provider's end-session endpoint. */
    signout(manager: UserManager, args: SignoutRedirectArgs): Promise<void>;

    /**
     * A completed redirect that arrived with nothing waiting for it, returned
     * once and then forgotten. The packaged app sits in the background for the
     * whole round trip and can be killed before the provider returns, which
     * leaves the response with no in-flight {@link signin} to resolve.
     * Undefined where the platform cannot strand a redirect.
     */
    consumePendingCallback?(): Promise<string | null>;
};
