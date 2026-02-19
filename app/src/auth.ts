import { Auth0Plugin, createAuth0 } from "@auth0/auth0-vue";
import { Auth0Client } from "@auth0/auth0-spa-js";
import { type App, ref, watch } from "vue";
import type { Router } from "vue-router";
import * as Sentry from "@sentry/vue";
import { type OAuthProviderPublicDto } from "luminary-shared";

export type AuthPlugin = Auth0Plugin & {
    logout: (retrying?: boolean) => Promise<void>;
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
    localStorage.removeItem("auth0AuthFailedRetryCount");
    // Do NOT remove SELECTED_PROVIDER_KEY here, as we want to persist it until explicitly changed or login with new provider succeeds
}

import { db, DocType, type OAuthProviderDto } from "luminary-shared";

/**
 * Get OAuth provider config from local DB or fallback to env vars.
 */
/**
 * Get OAuth provider config from local DB or fallback to env vars.
 */
async function getProviderConfig(): Promise<{
    domain: string;
    clientId: string;
    audience: string;
}> {
    try {
        let providers: OAuthProviderDto[] = [];

        // Try to get providers from local DB (synced)
        if (db) {
            providers = (await db.docs
                .where("type")
                .equals(DocType.OAuthProvider)
                .toArray()) as OAuthProviderDto[];
        } else {
            // DB not initialized yet (bootstrap), try raw IndexedDB
            providers = await new Promise<OAuthProviderDto[]>((resolve, reject) => {
                const request = indexedDB.open("luminary-db");
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const database = request.result;
                    if (!database.objectStoreNames.contains("docs")) {
                        database.close();
                        return resolve([]);
                    }
                    const transaction = database.transaction("docs", "readonly");
                    const store = transaction.objectStore("docs");
                    // We assume 'type' index exists as per schema
                    const index = store.index("type");
                    const query = index.getAll("oAuthProvider"); // DocType.OAuthProvider value

                    query.onsuccess = () => {
                        database.close();
                        resolve(query.result as OAuthProviderDto[]);
                    };
                    query.onerror = () => {
                        database.close();
                        reject(query.error);
                    };
                };
            });
        }

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
        console.warn("Failed to load providers from DB, falling back to env vars", e);
    }

    // Fallback to env vars (legacy or offline mode).
    // If env vars are also missing (dynamic-only setup), use safe placeholders so
    // createAuth0 doesn't crash. The plugin will be non-functional but the app
    // starts in guest mode; loginWithProvider() creates its own Auth0Client with the
    // real config once providers have been synced via the socket.
    return {
        domain: import.meta.env.VITE_AUTH0_DOMAIN || "auth.placeholder.local",
        clientId: import.meta.env.VITE_AUTH0_CLIENT_ID || "placeholder",
        audience: import.meta.env.VITE_AUTH0_AUDIENCE || "",
    };
}

/**
 * Get available OAuth providers from the local DB.
 */
/**
 * Get available OAuth providers from the local DB.
 */
export async function getAvailableProviders(): Promise<OAuthProviderPublicDto[]> {
    try {
        let docs: any[] = [];
        if (db) {
            docs = await db.docs.where("type").equals(DocType.OAuthProvider).toArray();
        } else {
            docs = await new Promise<any[]>((resolve, reject) => {
                const request = indexedDB.open("luminary-db");
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const database = request.result;
                    if (!database.objectStoreNames.contains("docs")) {
                        database.close();
                        return resolve([]);
                    }
                    const transaction = database.transaction("docs", "readonly");
                    const store = transaction.objectStore("docs");
                    const index = store.index("type");
                    const query = index.getAll("oAuthProvider");

                    query.onsuccess = () => {
                        database.close();
                        resolve(query.result);
                    };
                    query.onerror = () => {
                        database.close();
                        reject(query.error);
                    };
                };
            });
        }

        return docs.map((d: any) => ({
            id: d._id,
            label: d.label,
            domain: d.domain,
            clientId: d.clientId,
            audience: d.audience,
            icon: d.icon,
            iconOpacity: d.iconOpacity,
            textColor: d.textColor,
            backgroundColor: d.backgroundColor,
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

        // Remove query string parameters which were included in the callback. Note: Never do a hard-reload here, as it locks indexedDb in Safari due to the immediate reload
        // Login successful! Commit the proposed provider to permanent storage if it exists
        const proposedId = url.searchParams.get("providerId");
        if (proposedId) {
            localStorage.setItem(SELECTED_PROVIDER_KEY, proposedId);
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

        // We want to keep the current provider selected on logout, but we can also facilitate switching
        // if we want to default to the selection screen, we could remove it.
        // For now, let's keep it in local storage so next visit remembers it.
        // localStorage.removeItem(SELECTED_PROVIDER_KEY);

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
            const currentProviderId = getSelectedProviderId();
            if (currentProviderId) {
                url.searchParams.set("providerId", currentProviderId);
            }
            returnTo = url.toString();
        }

        return _Logout({
            logoutParams: {
                ...logoutParams, // Preserve other params if any
                returnTo,
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
