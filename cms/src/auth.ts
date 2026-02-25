import {
    Auth0Plugin,
    createAuth0,
    AUTH0_INJECTION_KEY,
} from "@auth0/auth0-vue";
import { Auth0Client } from "@auth0/auth0-spa-js";
import { type App, ref, watch } from "vue";
import type { Router } from "vue-router";
import * as Sentry from "@sentry/vue";
import {
    db,
    DocType,
    type OAuthProviderDto,
    type OAuthProviderPublicDto,
} from "luminary-shared";

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
 */
export function clearAuth0Cache(): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.startsWith("@@auth0spajs@@")) keysToRemove.push(key);
        if (key.startsWith("a0.spajs.txs")) keysToRemove.push(key);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem("usedAuth0Connection");
    localStorage.removeItem("auth0AuthFailedRetryCount");
}

/**
 * Get available OAuth providers from the local DB (synced; OAuthProvider has public view access).
 */
export async function getAvailableProviders(): Promise<
    OAuthProviderPublicDto[]
> {
    try {
        let docs: OAuthProviderDto[] = [];
        if (db) {
            docs = (await db.docs
                .where("type")
                .equals(DocType.OAuthProvider)
                .toArray()) as OAuthProviderDto[];
        } else {
            docs = await new Promise<OAuthProviderDto[]>((resolve, reject) => {
                const request = indexedDB.open("luminary-db");
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const database = request.result;
                    if (!database.objectStoreNames.contains("docs")) {
                        database.close();
                        return resolve([]);
                    }
                    const transaction = database.transaction(
                        "docs",
                        "readonly",
                    );
                    const store = transaction.objectStore("docs");
                    const index = store.index("type");
                    const query = index.getAll("oAuthProvider");
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
        return docs.map((d) => ({
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
 */
export async function loginWithProvider(
    provider: OAuthProviderPublicDto,
    options?: { prompt?: "login" },
): Promise<void> {
    const webOrigin = window.location.origin;
    const client = new Auth0Client({
        domain: provider.domain,
        clientId: provider.clientId,
        useRefreshTokens: true,
        useRefreshTokensFallback: true,
        cacheLocation: "localstorage",
        authorizationParams: {
            audience: provider.audience,
            scope: "openid profile email offline_access",
            redirect_uri: `${webOrigin}?providerId=${encodeURIComponent(provider.id)}`,
        },
    });
    await client.loginWithRedirect({
        authorizationParams: options?.prompt
            ? { prompt: options.prompt }
            : undefined,
    });
}

/**
 * Check if auth bypass mode is enabled (for development and E2E testing)
 */
export const isAuthBypassed = import.meta.env.VITE_AUTH_BYPASS === "true";

/**
 * Mock auth plugin for bypass mode
 */
function createMockAuth(): AuthPlugin {
    const mockAuth = {
        isAuthenticated: ref(true),
        isLoading: ref(false),
        user: ref({
            name: "E2E Test User",
            email: "e2e@test.local",
            sub: "e2e-test-user",
        }),
        idTokenClaims: ref(null),
        error: ref(null),
        loginWithRedirect: async () => {},
        loginWithPopup: async () => {},
        logout: async () => {},
        getAccessTokenSilently: async () => "mock-token-for-e2e-testing",
        getAccessTokenWithPopup: async () => "mock-token-for-e2e-testing",
        checkSession: async () => {},
        handleRedirectCallback: async () => ({ appState: {} }),
        install: () => {},
    } as unknown as AuthPlugin;

    return mockAuth;
}

type ProviderConfig = { domain: string; clientId: string; audience: string };

/**
 * Resolve which OAuth provider config to use (API, then env fallback).
 * Only returns config when we are in an OAuth callback (state in URL) so that we create the Auth0 plugin
 * only to handle the redirect; otherwise we use fallback auth and show the provider selection modal first.
 */
async function getProviderConfig(): Promise<ProviderConfig | undefined> {
    const urlParams = new URLSearchParams(window.location.search);
    const isCallback = urlParams.has("state");

    if (!isCallback) {
        return undefined;
    }

    const providers = await getAvailableProviders();
    const providerIdInUrl = urlParams.get("providerId");
    const selectedId = localStorage.getItem(SELECTED_PROVIDER_KEY);
    const idToUse =
        providerIdInUrl ??
        selectedId ??
        (providers.length === 1 ? providers[0].id : undefined);
    const provider = idToUse
        ? providers.find((p) => p.id === idToUse)
        : undefined;

    if (provider?.domain && provider?.clientId) {
        return {
            domain: provider.domain,
            clientId: provider.clientId,
            audience: provider.audience ?? "",
        };
    }

    const domain = import.meta.env.VITE_AUTH0_DOMAIN;
    const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
    if (domain && clientId) {
        return {
            domain,
            clientId,
            audience: import.meta.env.VITE_AUTH0_AUDIENCE ?? "",
        };
    }
    return undefined;
}

/**
 * Setup the Auth0 plugin.
 */
async function setupAuth(app: App<Element>, router: Router) {
    // If auth bypass is enabled, return a mock auth plugin
    if (isAuthBypassed) {
        console.warn(
            "⚠️ Auth bypass mode enabled - this should only be used for development/E2E testing",
        );
        const mockAuth = createMockAuth();
        app.config.globalProperties.$auth = mockAuth;
        return mockAuth;
    }

    app.config.globalProperties.$auth = null;
    const webOrigin = window.location.origin;
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
                await loginWithProvider(providers[0], { prompt: "login" });
            },
            logout: async () => {},
            getAccessTokenSilently: async () => undefined as unknown as string,
            loginWithPopup: async () => {},
            handleRedirectCallback: async () =>
                ({}) as unknown as ReturnType<
                    AuthPlugin["handleRedirectCallback"]
                >,
            checkSession: async () => {},
        } as unknown as AuthPlugin;
        app.provide(AUTH0_INJECTION_KEY, fallbackAuth);
        app.config.globalProperties.$auth = fallbackAuth;
        app.config.globalProperties.$auth0 = fallbackAuth;
        return fallbackAuth;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const providerIdInUrl = urlParams.get("providerId");
    const redirectUri = providerIdInUrl
        ? `${webOrigin}?providerId=${encodeURIComponent(providerIdInUrl)}`
        : webOrigin;

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
                redirect_uri: redirectUri,
            },
        },
        { skipRedirectCallback: true },
    );

    function getRedirectTo(): string {
        const route = router.currentRoute.value;
        return (
            (route.query.redirect_to as string) ||
            (new URLSearchParams(location.search).get(
                "redirect_to",
            ) as string) ||
            "/"
        );
    }

    async function redirectCallback(_url: string) {
        const url = new URL(_url);
        if (!url.searchParams.has("state")) return false;
        if (url.searchParams.has("error")) {
            const error = url.searchParams.get("error");
            console.error(error);
            alert(error);
            return false;
        }
        if (!url.searchParams.has("code")) return false;

        await oauth.handleRedirectCallback(url.toString()).catch(() => null);
        const proposedId = url.searchParams.get("providerId");
        if (proposedId) localStorage.setItem(SELECTED_PROVIDER_KEY, proposedId);

        const to = getRedirectTo();

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

    app.use(oauth);
    await redirectCallback(location.href);

    const _Logout = oauth.logout;
    (oauth as AuthPlugin).logout = (retrying = false) => {
        clearAuth0Cache();
        if (!retrying) localStorage.removeItem(SELECTED_PROVIDER_KEY);
        return _Logout({
            logoutParams: {
                returnTo: retrying ? webOrigin : `${webOrigin}?loggedOut`,
            },
        });
    };

    const _LoginWithRedirect = oauth.loginWithRedirect;
    oauth.loginWithRedirect = () => {
        return _LoginWithRedirect({
            authorizationParams: location.search.includes("loggedOut")
                ? { prompt: "login" }
                : undefined,
        });
    };

    if (oauth.isLoading.value) {
        await new Promise<void>((resolve) => {
            watch(oauth.isLoading, () => resolve(), { once: true });
        });
    }

    return oauth as AuthPlugin;
}

/**
 * Redirect the user to the login page.
 * Always shows the provider selection modal first when any providers exist; redirect to Auth0 only after the user selects a provider.
 */
async function loginRedirect(oauth: AuthPlugin) {
    const providers = await getAvailableProviders();
    if (providers.length >= 1) {
        showProviderSelectionModal.value = true;
        return;
    }

    const { loginWithRedirect, logout } = oauth;
    const usedConnection = localStorage.getItem("usedAuth0Connection");
    const retryCount = parseInt(
        localStorage.getItem("auth0AuthFailedRetryCount") || "0",
    );

    if (retryCount < 2) {
        localStorage.setItem(
            "auth0AuthFailedRetryCount",
            (retryCount + 1).toString(),
        );
        await loginWithRedirect({
            authorizationParams: {
                connection: usedConnection ?? undefined,
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
    } else {
        await loginRedirect(oauth);
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
