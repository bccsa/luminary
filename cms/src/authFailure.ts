import { getSocket } from "luminary-shared";
import {
    clearAuthCache,
    isAuthBypassed,
    loginWithProvider,
    openProviderModal,
    refreshTokenSilently,
    resolveActiveProvider,
} from "@/auth";
import * as Sentry from "@sentry/vue";

type AuthConnectError = Error & { data?: { type?: string; reason?: string } };

/**
 * Recover from a socket handshake the API rejected on auth grounds.
 */
export async function handleConnectError(err: AuthConnectError): Promise<void> {
    if (err.data?.type !== "auth_failed" && err.message !== "auth_failed") return;
    const reason = err.data?.reason;

    // Provider was deleted / never existed: don't re-attempt login with the
    // cached provider (it'll loop). Force the user through provider selection.
    if (reason === "provider_not_found") {
        clearAuthCache();
        openProviderModal();
        // The socket stops auto-reconnecting after an auth failure, so without an
        // explicit anonymous connect nothing syncs the AuthProvider docs that the
        // modal just opened to display.
        getSocket().connect();
        return;
    }

    // Normal case: the access token expired. Ask the OIDC client for a fresh one
    // via the refresh token — no redirect needed. Bypass the client's token cache:
    // the server already rejected what we had, so we must hit the token endpoint.
    if (await refreshTokenSilently({ ignoreCache: true })) return;

    // The refresh token itself is gone or rejected — need a visible re-login.
    Sentry.captureMessage("API authentication failed; silent refresh failed");
    const lastProvider = await resolveActiveProvider();
    clearAuthCache();
    if (lastProvider) {
        await loginWithProvider(lastProvider, { prompt: "login" });
    } else {
        openProviderModal();
        // Same reason as the provider_not_found branch: auto-reconnection is off
        // after an auth failure, so without this the modal has nothing to list.
        getSocket().connect();
    }
}

/**
 * Attach the handler. Must run before setupAuth(), which may connect with an
 * already-expired token: a listener attached after that misses the failure event
 * and the client loops.
 */
export function registerAuthFailureHandler(): void {
    if (isAuthBypassed) return;
    getSocket().on("connect_error", handleConnectError);
}
