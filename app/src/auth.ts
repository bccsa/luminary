import { Auth0Plugin, createAuth0, AUTH0_INJECTION_KEY } from "@auth0/auth0-vue";
import { Auth0Client } from "@auth0/auth0-spa-js";
import { type App, ref, watch } from "vue";
import type { Router } from "vue-router";
import * as Sentry from "@sentry/vue";
import { type OAuthProviderPublicDto } from "luminary-shared";

export type AuthPlugin = Auth0Plugin & {
    logout: () => Promise<void>;
};

const SELECTED_PROVIDER_KEY = "selectedOAuthProviderId";

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
    // Do NOT remove SELECTED_PROVIDER_KEY here, as we want to persist it until explicitly changed or login with new provider succeeds
}

import { db, DocType, type OAuthProviderDto } from "luminary-shared";

/**
 * Get OAuth provider config from local DB.
 * Returns undefined when no provider is available yet (guest mode).
 */
async function getProviderConfig(): Promise<
    | {
          domain: string;
          clientId: string;
          audience: string;
      }
    | undefined
> {
    try {
        if (!db) return undefined;

        const providers = (await db.docs
            .where("type")
            .equals(DocType.OAuthProvider)
            .toArray()) as OAuthProviderDto[];

        if (providers.length > 0) {
            // Check for saved selection
            const selectedId = localStorage.getItem(SELECTED_PROVIDER_KEY);

            // Check for proposed selection from URL (query param) - used during login flow
            const urlParams = new URLSearchParams(window.location.search);
            const proposedId = urlParams.get("providerId");

            // If we are in the middle of a login flow (triggerLogin or callback), prefer the proposed ID
            const isLoginFlow =
                urlParams.has("providerId") || urlParams.has("code") || urlParams.has("state");

            let idToUse = selectedId;
            if (isLoginFlow && proposedId) {
                idToUse = proposedId;
            }

            const selected = idToUse ? providers.find((p) => p._id === idToUse) : providers[0];
            const provider = selected ?? providers[0];

            if (provider.domain && provider.clientId && provider.audience) {
                return {
                    domain: provider.domain,
                    clientId: provider.clientId,
                    audience: provider.audience,
                };
            }
        }
    } catch (e) {
        console.warn("Failed to load providers from DB", e);
    }

    return undefined;
}

/**
 * Get available OAuth providers from the local DB (synced; OAuthProvider has public view access).
 */
export async function getAvailableProviders(): Promise<OAuthProviderPublicDto[]> {
    try {
        if (!db) return [];

        const docs = (await db.docs
            .where("type")
            .equals(DocType.OAuthProvider)
            .toArray()) as OAuthProviderDto[];

        // Exclude Guest provider so it is never shown on the login list
        const visible = docs.filter((d) => !(d as Record<string, unknown>).isGuestProvider);
        return visible.map((d) => ({
            id: d._id,
            label: d.label,
            domain: d.domain ?? "",
            clientId: d.clientId ?? "",
            audience: d.audience ?? "",
            icon: d.icon,
            iconOpacity: d.iconOpacity,
            textColor: d.textColor,
            backgroundColor: d.backgroundColor,
            isGuestProvider: (d as Record<string, unknown>).isGuestProvider,
        })) as OAuthProviderPublicDto[];
    } catch {
        return [];
    }
}

/**
 * Login with a specific provider.
 * Creates a temporary Auth0 client to trigger the redirect.
 */
export async function loginWithProvider(
    provider: OAuthProviderPublicDto,
    options?: { prompt?: "login" },
) {
    const web_origin = window.location.origin;

    const client = new Auth0Client({
        domain: provider.domain,
        clientId: provider.clientId,
        useRefreshTokens: true,
        useRefreshTokensFallback: true,
        cacheLocation: "localstorage",
        authorizationParams: {
            audience: provider.audience,
            scope: "openid profile email offline_access",
            redirect_uri: `${web_origin}?providerId=${encodeURIComponent(provider.id)}`,
        },
    });

    await client.loginWithRedirect({
        authorizationParams: options?.prompt ? { prompt: options.prompt } : undefined,
    });
}

/**
 * Get the currently selected OAuth provider ID.
 */
export function getSelectedProviderId(): string | undefined {
    const urlParams = new URLSearchParams(window.location.search);
    const hasProviderId = urlParams.has("providerId");
    const isCallback = urlParams.has("code") || urlParams.has("state");

    if (hasProviderId && !isCallback) {
        return undefined;
    }

    return localStorage.getItem(SELECTED_PROVIDER_KEY) ?? undefined;
}

/**
 * Setup the Auth0 plugin.
 */
async function setupAuth(app: App<Element>, router: Router) {
    app.config.globalProperties.$auth = null; // Clear existing auth
    const web_origin = window.location.origin;

    const config = await getProviderConfig();

    if (!config) {
        // No provider config at startup (e.g. sync not run yet). Provide minimal auth so useAuth0() is defined.
        // Public access is handled by the API permission map (group-public-users), not by this object.
        // loginWithRedirect triggers real login via getAvailableProviders + loginWithProvider so the Login button works.
        const fallbackAuth = {
            isAuthenticated: ref(false),
            isLoading: ref(false),
            user: ref(undefined),
            idTokenClaims: ref(undefined),
            error: ref(undefined),
            loginWithRedirect: async () => {
                const providers = await getAvailableProviders();
                if (providers.length === 0) {
                    showProviderSelectionModal.value = true;
                    return;
                }
                if (providers.length > 1) {
                    showProviderSelectionModal.value = true;
                    return;
                }
                await loginWithProvider(providers[0]);
            },
            logout: async () => {},
            getAccessTokenSilently: async () => undefined as unknown as string,
            loginWithPopup: async () => {},
            handleRedirectCallback: async () =>
                ({}) as unknown as ReturnType<AuthPlugin["handleRedirectCallback"]>,
            checkSession: async () => {},
        } as unknown as AuthPlugin;
        app.provide(AUTH0_INJECTION_KEY, fallbackAuth);
        app.config.globalProperties.$auth = fallbackAuth;
        app.config.globalProperties.$auth0 = fallbackAuth;
        return fallbackAuth;
    }

    // Determine the redirect_uri that was used (must match exactly for code exchange)
    const urlParams = new URLSearchParams(window.location.search);
    const providerIdInUrl = urlParams.get("providerId");
    const redirect_uri = providerIdInUrl
        ? `${web_origin}?providerId=${encodeURIComponent(providerIdInUrl)}`
        : web_origin;

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
                redirect_uri,
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

        // Remove query string parameters which were included in the callback...
        const proposedId = url.searchParams.get("providerId");
        if (proposedId) {
            localStorage.setItem(SELECTED_PROVIDER_KEY, proposedId);
        }

        // Clean the browser URL of auth parameters to prevent them from showing after login
        window.history.replaceState({}, document.title, to);

        // Explicitly parse the target route to prevent vue-router from carrying over the
        // initial auth callback query parameters (like providerId, code) when evaluating redirects.
        const targetUrl = new URL(to, window.location.origin);
        router.push({
            path: targetUrl.pathname,
            query: Object.fromEntries(targetUrl.searchParams),
        });

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
    (oauth as AuthPlugin).logout = () => {
        clearAuth0Cache();
        localStorage.removeItem(SELECTED_PROVIDER_KEY);

        return _Logout({
            logoutParams: {
                returnTo: web_origin,
            },
        });
    };

    // Handle login – never pass prompt so Auth0 can use SSO on return-from-logout
    const _LoginWithRedirect = oauth.loginWithRedirect;
    oauth.loginWithRedirect = () => {
        return _LoginWithRedirect();
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
    await logout();
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
