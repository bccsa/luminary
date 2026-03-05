import { Auth0Plugin, createAuth0, AUTH0_INJECTION_KEY } from "@auth0/auth0-vue";
import { Auth0Client } from "@auth0/auth0-spa-js";
import { type App, ref, watch } from "vue";
import type { Router } from "vue-router";
import * as Sentry from "@sentry/vue";
import { type OAuthProviderPublicDto } from "luminary-shared";

export type AuthPlugin = Auth0Plugin & {
    logout: () => Promise<void>;
};

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
}

import { db, DocType, type OAuthProviderDto, useDexieLiveQuery } from "luminary-shared";

type ProviderConfig = { domain: string; clientId: string; audience: string };

function detectConfig(providers: OAuthProviderDto[]): ProviderConfig | undefined {
    if (providers.length === 0) return undefined;

    const toConfig = (p: OAuthProviderDto): ProviderConfig | undefined =>
        p.domain && p.clientId && p.audience
            ? { domain: p.domain, clientId: p.clientId, audience: p.audience }
            : undefined;

    // 1. Auth0 PKCE transaction key — present in sessionStorage during the
    //    OAuth callback window. Identifies the provider that initiated login.
    for (const p of providers) {
        if (p.clientId && sessionStorage.getItem(`a0.spajs.txs.${p.clientId}`) !== null) {
            const cfg = toConfig(p);
            if (cfg) return cfg;
        }
    }

    // 2. Auth0 token cache in localStorage (cacheLocation: "localstorage") —
    //    present when the user returns after closing and reopening the browser.
    for (const p of providers) {
        for (let i = 0; i < localStorage.length; i++) {
            if (localStorage.key(i)?.startsWith(`@@auth0spajs@@::${p.clientId}`)) {
                const cfg = toConfig(p);
                if (cfg) return cfg;
            }
        }
    }

    // 3. Single provider — use it automatically.
    if (providers.length === 1) return toConfig(providers[0]);

    return undefined;
}

/**
 * Resolve the active OAuth provider config using Dexie's liveQuery for reactivity.
 * Reacts immediately when IndexedDB changes — no polling needed.
 *
 * @param waitMs - If > 0, waits up to this many ms for a valid config to appear
 *                 (use during an OAuth callback when providers may still be syncing).
 *                 If 0 (default), resolves after the first DB read regardless of result.
 */
async function getProviderConfig(waitMs = 0): Promise<ProviderConfig | undefined> {
    if (!db) return undefined;

    const providers = useDexieLiveQuery(
        () => db!.docs.where("type").equals(DocType.OAuthProvider).toArray(),
    );

    return new Promise<ProviderConfig | undefined>((resolve) => {
        const deadline =
            waitMs > 0
                ? setTimeout(() => {
                      stopWatch();
                      resolve(undefined);
                  }, waitMs)
                : undefined;

        const stopWatch = watch(
            providers,
            (docs) => {
                if (docs === undefined) return; // liveQuery hasn't emitted yet — wait
                const cfg = detectConfig(docs as OAuthProviderDto[]);
                if (cfg !== undefined || waitMs === 0) {
                    clearTimeout(deadline);
                    stopWatch();
                    resolve(cfg);
                }
            },
            { immediate: true },
        );
    });
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

/**
 * Install the Auth0 plugin (or fallback) so useAuth0() is available before the router runs.
 * Call this before app.use(router).
 */
export async function installAuth(app: App<Element>): Promise<AuthPlugin> {
    app.config.globalProperties.$auth = null;
    const web_origin = window.location.origin;

    // On an OAuth callback (?code=&state=) providers may still be syncing from
    // the API, so wait up to 5 s for a valid config to appear via liveQuery.
    // On a normal page load, resolve immediately after the first DB read.
    const url = new URL(location.href);
    const isCallback = url.searchParams.has("code") && url.searchParams.has("state");
    const config = await getProviderConfig(isCallback ? 5000 : 0);

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
            await oauth.handleRedirectCallback(callbackUrl);
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

    const providers = await getAvailableProviders();
    if (providers.length > 1) {
        showProviderSelectionModal.value = true;
        return;
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
};
