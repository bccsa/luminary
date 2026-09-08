import {
    OidcClient,
    type SigninRedirectArgs,
    type SignoutRedirectArgs,
    type User,
    type UserManager,
} from "oidc-client-ts";
import type { AuthFlowService } from "@/build-time/contracts/auth-flow/contract";

/** URL scheme the packaged app is registered for; providers whitelist redirect URIs under it. */
const APP_SCHEME = import.meta.env.VITE_APP_URL_SCHEME || "africa.activechristianity.app";

type AuthBrowserBridge = {
    open?: (opts: { url: string }) => Promise<{ result?: string }>;
};

function authBrowser(): AuthBrowserBridge | undefined {
    return (
        window as unknown as {
            Capacitor?: { Plugins?: { AuthBrowser?: AuthBrowserBridge } };
        }
    ).Capacitor?.Plugins?.AuthBrowser;
}

function providerHost(domain: string): string {
    return domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/**
 * Packaged-app {@link AuthFlowService}: the authorization round trip runs in a
 * system auth session (native `AuthBrowser` bridge) that delivers the callback
 * URL straight back to this page — the SPA never navigates or reboots, so the
 * response is processed here instead of by boot-time callback handling.
 */
export class NativeAuthFlowService implements AuthFlowService {
    readonly signoutNavigates = false;

    /**
     * The custom-scheme callback shape providers whitelist for native apps.
     *
     * Onboarding a provider for native needs, on the provider side:
     * - this URI in the client's allowed callback URLs
     * - `{scheme}://` in the allowed post-logout redirect URLs
     * - a client registration that permits custom-scheme redirect URIs
     *   (usually a "native"/public client type)
     * - token-endpoint CORS allowing the packaged app's webview origin,
     *   the same requirement the browser flow puts on the web origin
     */
    redirectUri(providerDomain: string): string {
        return `${APP_SCHEME}://${providerHost(providerDomain)}/capacitor/${APP_SCHEME}/callback`;
    }

    postLogoutRedirectUri(): string {
        return `${APP_SCHEME}://`;
    }

    async signin(manager: UserManager, args: SigninRedirectArgs): Promise<User | null> {
        const bridge = authBrowser();
        if (!bridge?.open) throw new Error("AuthBrowser bridge unavailable");

        // Shares the manager's settings object, and with it the state store the
        // manager validates against when the callback below is processed.
        const client = new OidcClient(manager.settings);
        const request = await client.createSigninRequest({ request_type: "si:r", ...args });

        let callbackUrl: string;
        try {
            const outcome = await bridge.open({ url: request.url });
            if (!outcome?.result || outcome.result === "failed") return null;
            callbackUrl = outcome.result;
        } catch {
            // The user dismissed the auth session (or it failed to start) —
            // a cancelled login, not an application error.
            return null;
        }

        return manager.signinRedirectCallback(callbackUrl);
    }

    async signout(manager: UserManager, args: SignoutRedirectArgs): Promise<void> {
        const bridge = authBrowser();
        if (!bridge?.open) return;

        const client = new OidcClient(manager.settings);
        const request = await client.createSignoutRequest({ request_type: "so:r", ...args });
        try {
            await bridge.open({ url: request.url });
        } catch {
            // Dismissing the end-session sheet still leaves local state cleared.
        }
    }
}
