import { Auth0Plugin, createAuth0, AUTH0_INJECTION_KEY } from "@auth0/auth0-vue";
import { Auth0Client } from "@auth0/auth0-spa-js";
import { type App, ref, watch } from "vue";
import type { Router } from "vue-router";
import * as Sentry from "@sentry/vue";
import { type OAuthProviderPublicDto } from "luminary-shared";

export type AuthPlugin = Auth0Plugin & {
    logout: () => Promise<void>;
};

const SESSION_PROVIDER_KEY = "sessionOAuthProviderId";
const PROVIDER_CONFIG_CACHE_KEY = "oAuthProviderConfigCache";

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
    localStorage.removeItem("usedAuth0Connection");
    localStorage.removeItem("auth0AuthFailedRetryCount");
    sessionStorage.removeItem(SESSION_PROVIDER_KEY);
}

import { db, DocType, type OAuthProviderDto } from "luminary-shared";

/**
 * Get OAuth provider config from local DB.
 * Returns undefined when no provider is available yet (guest mode).
 */
type ProviderConfig = { domain: string; clientId: string; audience: string };

/**
 * Cache provider config to localStorage so page refreshes can restore
 * the Auth0 session before IndexedDB is ready.
 */
function cacheProviderConfig(config: ProviderConfig) {
    localStorage.setItem(PROVIDER_CONFIG_CACHE_KEY, JSON.stringify(config));
}

function getCachedProviderConfig(): ProviderConfig | undefined {
    const raw = localStorage.getItem(PROVIDER_CONFIG_CACHE_KEY);
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(raw);
        if (parsed.domain && parsed.clientId) return parsed as ProviderConfig;
    } catch {
        /* corrupted cache — ignore */
    }
    return undefined;
}

async function getProviderConfig(): Promise<ProviderConfig | undefined> {
    try {
        if (!db) {
            // db not initialised yet — fall back to localStorage cache
            return getCachedProviderConfig();
        }

        const providers = (await db.docs
            .where("type")
            .equals(DocType.OAuthProvider)
            .toArray()) as OAuthProviderDto[];

        if (providers.length > 0) {
            const selectedId = sessionStorage.getItem(SESSION_PROVIDER_KEY);
            const idToUse = selectedId ?? undefined;

            const selected = idToUse ? providers.find((p) => p._id === idToUse) : providers[0];
            const provider = selected ?? providers[0];

            if (provider.domain && provider.clientId && provider.audience) {
                const config: ProviderConfig = {
                    domain: provider.domain,
                    clientId: provider.clientId,
                    audience: provider.audience,
                };
                cacheProviderConfig(config);
                return config;
            }
        }
    } catch (e) {
        console.warn("Failed to load providers from DB", e);
    }

    // Final fallback: localStorage cache from a previous session
    return getCachedProviderConfig();
}

/**
 * Get available OAuth providers from the local DB (synced; OAuthProvider has public view access).
 * Providers with isGuestProvider are excluded so only real login options (e.g. Auth0) are shown.
 */
export async function getAvailableProviders(): Promise<OAuthProviderPublicDto[]> {
    try {
        if (!db) return [];

        const docs = (await db.docs
            .where("type")
            .equals(DocType.OAuthProvider)
            .toArray()) as OAuthProviderDto[];

        return docs
            .filter((d) => !d.isGuestProvider)
            .map((d) => ({
                id: d._id,
                label: d.label,
                domain: d.domain ?? "",
                clientId: d.clientId ?? "",
                audience: d.audience ?? "",
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
    // Cache provider config so Auth0 SDK can initialize after the redirect page reload
    cacheProviderConfig({
        domain: provider.domain,
        clientId: provider.clientId,
        audience: provider.audience,
    });

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
            redirect_uri: web_origin,
        },
    });

    await client.loginWithRedirect({
        appState: { providerId: provider.id },
        authorizationParams: options?.prompt ? { prompt: options.prompt } : undefined,
    });
}

/** Provider ID for the current session (not in URL or localStorage). */
export function getSelectedProviderId(): string | undefined {
    return sessionStorage.getItem(SESSION_PROVIDER_KEY) ?? undefined;
}

/**
 * Install the Auth0 plugin (or fallback) so useAuth0() is available before the router runs.
 * Call this before app.use(router).
 */
export async function installAuth(app: App<Element>): Promise<AuthPlugin> {
    app.config.globalProperties.$auth = null;
    const web_origin = window.location.origin;
    const config = await getProviderConfig();

    if (!config) {
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
    app.use(oauth);
    return oauth as AuthPlugin;
}

/**
 * Finish auth setup (redirect callback, logout/login wrappers). Requires router; call after app.use(router).
 */
export async function finishAuth(app: App<Element>, router: Router, oauth: AuthPlugin): Promise<void> {
    const web_origin = window.location.origin;

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

        const callbackUrl = url.toString();

        window.history.replaceState({}, document.title, "/");

        try {
            const result = await oauth.handleRedirectCallback(callbackUrl);
            const providerId = (result?.appState as { providerId?: string })?.providerId;
            if (providerId) {
                sessionStorage.setItem(SESSION_PROVIDER_KEY, providerId);
            }
        } catch (err) {
            console.error("Auth0 callback handling failed:", err);
        }

        router.push("/");
        return true;
    }

    await redirectCallback(location.href);

    const _Logout = oauth.logout;
    (oauth as AuthPlugin).logout = () => {
        clearAuth0Cache();
        return _Logout({
            logoutParams: { returnTo: web_origin },
        });
    };

    const _LoginWithRedirect = oauth.loginWithRedirect;
    oauth.loginWithRedirect = () => _LoginWithRedirect();

    if (oauth.isLoading.value) {
        await new Promise<void>((resolve) => {
            watch(oauth.isLoading, () => resolve(), { once: true });
        });
    }
}

/**
 * Setup the Auth0 plugin (install + finish). Call installAuth before app.use(router), then finishAuth after.
 */
async function setupAuth(app: App<Element>, router: Router) {
    const oauth = await installAuth(app);
    await finishAuth(app, router, oauth);
    return oauth;
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
    installAuth,
    finishAuth,
    loginRedirect,
    getToken,
    getSelectedProviderId,
};
