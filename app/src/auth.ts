import { Auth0Plugin, createAuth0 } from "@auth0/auth0-vue";
import { type App, ref, watch } from "vue";
import type { Router } from "vue-router";
import * as Sentry from "@sentry/vue";
import { getRest, type OAuthProviderPublicDto } from "luminary-shared";

export type AuthPlugin = Auth0Plugin & {
    logout: (retrying?: boolean) => Promise<void>;
};

const SELECTED_PROVIDER_KEY = "selectedOAuthProviderId";
const PROPOSED_PROVIDER_KEY = "proposedOAuthProviderId";

/**
 * Reactive flag to show/hide the provider selection modal.
 */
export const showProviderSelectionModal = ref(false);

/**
 * Clear Auth0 SDK's localStorage cache and related keys.
 * This ensures a clean slate when switching between OAuth providers,
 * preventing stale tokens from the previous provider being reused.
 */
export function clearAuth0Cache(): void {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;

        // Auth0 SPA SDK token cache keys
        if (key.startsWith("@@auth0spajs@@")) keysToRemove.push(key);
        // Auth0 SPA SDK transaction keys
        if (key.startsWith("a0.spajs.txs")) keysToRemove.push(key);
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));

    // Clear connection and retry state from previous provider
    localStorage.removeItem("usedAuth0Connection");
    localStorage.removeItem("auth0AuthFailedRetryCount");
    localStorage.removeItem("auth0AuthFailedRetryCount");
    // Do NOT remove SELECTED_PROVIDER_KEY here, as we want to persist it until explicitly changed or login with new provider succeeds
}

/**
 * Get OAuth provider config from API or fallback to env vars.
 */
async function getProviderConfig(): Promise<{
    domain: string;
    clientId: string;
    audience: string;
}> {
    try {
        const rest = getRest();
        const providers = await rest.getOAuthProviders();

        if (providers.length > 0) {
            // Check for saved selection
            const selectedId = localStorage.getItem(SELECTED_PROVIDER_KEY);
            // Check for proposed selection (session only) - used during login flow
            const proposedId = sessionStorage.getItem(PROPOSED_PROVIDER_KEY);

            // If we are in the middle of a login flow (triggerLogin or callback), prefer the proposed ID
            const isLoginFlow =
                location.search.includes("triggerLogin") ||
                location.search.includes("code=") ||
                location.search.includes("state=");

            let idToUse = selectedId;
            if (isLoginFlow && proposedId) {
                idToUse = proposedId;
            }

            const selected = idToUse ? providers.find((p) => p.id === idToUse) : providers[0];

            const provider = selected ?? providers[0];

            return {
                domain: provider.domain,
                clientId: provider.clientId,
                audience: provider.audience,
            };
        }
    } catch {
        // API unreachable or failed, fall back to env vars
    }

    // Fallback to env vars (legacy or offline mode)
    return {
        domain: import.meta.env.VITE_AUTH0_DOMAIN,
        clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
    };
}

/**
 * Get available OAuth providers from the API.
 */
export async function getAvailableProviders(): Promise<OAuthProviderPublicDto[]> {
    try {
        const rest = getRest();
        return await rest.getOAuthProviders();
    } catch {
        return [];
    }
}

/**
 * Set the selected OAuth provider by ID.
 * Clears the Auth0 cache first to ensure a clean login with the new provider.
 */
export function setProposedProvider(providerId: string): void {
    clearAuth0Cache();
    sessionStorage.setItem(PROPOSED_PROVIDER_KEY, providerId);
}

/**
 * Get the currently selected OAuth provider ID.
 */
export function getSelectedProviderId(): string | undefined {
    return localStorage.getItem(SELECTED_PROVIDER_KEY) ?? undefined;
}

/**
 * Setup the Auth0 plugin.
 */
async function setupAuth(app: App<Element>, router: Router) {
    app.config.globalProperties.$auth = null; // Clear existing auth
    const web_origin = window.location.origin;

    const config = await getProviderConfig();

    const oauth = createAuth0(
        {
            domain: config.domain,
            clientId: config.clientId,
            useRefreshTokens: true,
            useRefreshTokensFallback: true,
            cacheLocation: "localstorage",
            authorizationParams: {
                audience: config.audience,
                scope: "openid profile email offline_access",
                redirect_uri: web_origin,
            },
        },
        {
            skipRedirectCallback: true,
        },
    );

    // Handle redirects (Save token to local storage)
    async function redirectCallback(_url: string) {
        const url = new URL(_url);
        if (!url.searchParams.has("state")) return false;

        if (url.searchParams.has("error")) {
            const error = url.searchParams.get("error");
            const errorDescription = url.searchParams.get("error_description");
            console.error("Auth0 callback error:", error, errorDescription);
            alert(`Login error: ${error}\n${errorDescription || ""}`);
            return false;
        }

        if (!url.searchParams.has("code")) return false;

        try {
            await oauth.handleRedirectCallback(url.toString());
        } catch (err) {
            console.error("Auth0 callback handling failed:", err);
            // Don't block the app, but log the error
        }

        const to = getRedirectTo() || "/";

        // Remove query string parameters which were included in the callback. Note: Never do a hard-reload here, as it locks indexedDb in Safari due to the immediate reload
        // Login successful! Commit the proposed provider to permanent storage if it exists
        const proposedId = sessionStorage.getItem(PROPOSED_PROVIDER_KEY);
        if (proposedId) {
            localStorage.setItem(SELECTED_PROVIDER_KEY, proposedId);
            sessionStorage.removeItem(PROPOSED_PROVIDER_KEY);
        }

        router.push(to);

        return true;
    }

    // Handle redirects, if user needs to login and open the app via link with slug
    function getRedirectTo(): string {
        const route = router.currentRoute.value;
        return (
            (route.query.redirect_to as string) ||
            (new URLSearchParams(location.search).get("redirect_to") as string)
        );
    }

    app.use(oauth);

    // Handle login
    await redirectCallback(location.href);

    // Handle logout
    const _Logout = oauth.logout;
    (oauth as AuthPlugin).logout = (options?: any) => {
        // Reset all auth state so the app returns to a clean "never logged in" state
        clearAuth0Cache();
        localStorage.removeItem(SELECTED_PROVIDER_KEY);

        let retrying = false;
        let logoutParams: any = {};

        if (typeof options === "boolean") {
            retrying = options;
        } else if (options && typeof options === "object") {
            logoutParams = options.logoutParams || {};
        }

        let returnTo = logoutParams.returnTo || web_origin;

        if (!retrying) {
            const url = new URL(returnTo);
            url.searchParams.set("loggedOut", "true");
            returnTo = url.toString();
        }

        return _Logout({
            logoutParams: {
                ...logoutParams, // Preserve other params if any
                returnTo,
            },
        });
    };

    // Handle login
    const _LoginWithRedirect = oauth.loginWithRedirect;
    oauth.loginWithRedirect = () => {
        return _LoginWithRedirect({
            authorizationParams: location.search.includes("loggedOut")
                ? {
                      prompt: "login",
                  }
                : undefined,
        });
    };

    if (oauth.isLoading.value) {
        // await while loading:
        await new Promise((resolve) => {
            watch(oauth.isLoading, () => resolve(void 0), { once: true });
        });
    }

    return oauth as AuthPlugin;
}

/**
 * Redirect the user to the login page.
 */
async function loginRedirect(oauth: AuthPlugin) {
    const { loginWithRedirect, logout } = oauth;

    // Check if we have a selected provider
    const selectedProviderId = getSelectedProviderId();

    // If no provider selected, check availability
    if (!selectedProviderId) {
        const providers = await getAvailableProviders();
        if (providers.length > 1) {
            // Multiple providers and none selected - show provider selection modal
            showProviderSelectionModal.value = true;
            return;
        }
        // If 0 or 1 provider, fall through to default behavior (auto-login with default/env vars)
    }

    const usedConnection = localStorage.getItem("usedAuth0Connection");
    const retryCount = parseInt(localStorage.getItem("auth0AuthFailedRetryCount") || "0");

    // Try to login. If this fails (e.g. the user cancels the login), log the user out after the second attempt
    if (retryCount < 2) {
        localStorage.setItem("auth0AuthFailedRetryCount", (retryCount + 1).toString());
        await loginWithRedirect({
            authorizationParams: {
                connection: usedConnection ? usedConnection : undefined,
                redirect_uri: window.location.origin,
            },
        });
        return;
    }

    localStorage.removeItem("auth0AuthFailedRetryCount");
    localStorage.removeItem("usedAuth0Connection");
    await logout({ logoutParams: { returnTo: window.location.origin } });
}

/**
 * Get the user's auth token. Redirect to login if necessary.
 */
async function getToken(oauth: AuthPlugin) {
    const { isAuthenticated, getAccessTokenSilently } = oauth;

    if (isAuthenticated.value) {
        try {
            return await getAccessTokenSilently();
        } catch (err) {
            Sentry.captureException(err);
            await loginRedirect(oauth);
        }
    }
}

// Clear the auth0AuthFailedRetryCount if the user logs in successfully (if the app is not redirecting to the login page, we assume the user either logged out or the login was successful)
setTimeout(() => {
    localStorage.removeItem("auth0AuthFailedRetryCount");
}, 10000);

export default {
    setupAuth,
    loginRedirect,
    getToken,
};
