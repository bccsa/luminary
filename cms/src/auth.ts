import { Auth0Plugin, createAuth0 } from "@auth0/auth0-vue";
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

const SESSION_PROVIDER_KEY = "sessionOAuthProviderId";

/** In-memory only: avoid processing the same callback twice in one page load. */
const processedCallbackStates = new Set<string>();

/** Set by installAuth so the route guard can access the plugin without redirecting to Auth0. */
let currentOauth: AuthPlugin | null = null;

/**
 * Reactive flag to show/hide the provider selection modal.
 */
export const showProviderSelectionModal = ref(false);

/**
 * Route guard that waits for Auth0 to finish loading, then allows navigation.
 * If not authenticated, shows the provider selection modal and still allows navigation
 * (no redirect to Auth0), avoiding an infinite redirect loop after login.
 */
export async function cmsAuthGuard(): Promise<boolean | void> {
    const oauth = currentOauth;
    if (!oauth || isAuthBypassed) return true;
    if (oauth.isLoading.value) {
        await new Promise<void>((resolve) => {
            watch(oauth.isLoading, (v) => {
                if (!v) resolve();
            }, { once: true });
        });
    }
    if (oauth.isAuthenticated.value) return true;
    // Re-check after a tick (SDK can lag after OAuth callback); only show modal if still not authenticated
    await Promise.resolve();
    if (oauth.isAuthenticated.value) return true;
    showProviderSelectionModal.value = true;
    return true; // allow navigation; user sees loading state + modal, no redirect to Auth0
}

/**
 * Clear app auth state from sessionStorage on logout.
 * Auth0 SDK uses memory-only cache, so no Auth0 keys are stored.
 */
export function clearAuth0Cache(): void {
    sessionStorage.removeItem(SESSION_PROVIDER_KEY);
    processedCallbackStates.clear();
}

/**
 * Get available OAuth providers from the local DB (synced; OAuthProvider has public view access).
 * Providers with isGuestProvider are excluded so only real login options (e.g. Auth0) are shown.
 */
export async function getAvailableProviders(): Promise<
    OAuthProviderPublicDto[]
> {
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
 * Stores only provider id in sessionStorage so after redirect we can load config from DB.
 */
export async function loginWithProvider(
    provider: OAuthProviderPublicDto,
    options?: { prompt?: "login" },
): Promise<void> {
    sessionStorage.setItem(SESSION_PROVIDER_KEY, provider.id);

    const webOrigin = window.location.origin;
    const client = new Auth0Client({
        domain: provider.domain,
        clientId: provider.clientId,
        useRefreshTokens: true,
        useRefreshTokensFallback: true,
        cacheLocation: "memory",
        authorizationParams: {
            audience: provider.audience,
            scope: "openid profile email offline_access",
            redirect_uri: webOrigin,
        },
    });
    await client.loginWithRedirect({
        appState: { providerId: provider.id },
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

/** Provider ID for the current session (from sessionStorage, set before redirect). */
export function getSelectedProviderId(): string | undefined {
    return sessionStorage.getItem(SESSION_PROVIDER_KEY) ?? undefined;
}

/**
 * Resolve which OAuth provider config to use from IndexedDB only.
 * Caller must run init() and wait for providers before setupAuth() so DB is ready.
 */
async function getProviderConfig(): Promise<ProviderConfig | undefined> {
    const providers = await getAvailableProviders();
    if (providers.length === 0) return undefined;

    const selectedId = sessionStorage.getItem(SESSION_PROVIDER_KEY);
    const idToUse =
        selectedId ?? (providers.length === 1 ? providers[0].id : undefined);
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
    return undefined;
}

/**
 * Install the Auth0 plugin before the router so useAuth0() is available when the router runs.
 * Call installAuth(app), then app.use(router), then finishAuth(app, router, oauth).
 * Returns null when no provider config is available (e.g. no provider selected yet).
 */
async function installAuth(app: App<Element>): Promise<AuthPlugin | null> {
    if (isAuthBypassed) {
        console.warn(
            "⚠️ Auth bypass mode enabled - this should only be used for development/E2E testing",
        );
        const mockAuth = createMockAuth();
        app.config.globalProperties.$auth = mockAuth;
        currentOauth = mockAuth;
        return mockAuth;
    }

    const config = await getProviderConfig();
    if (!config) return null;

    const webOrigin = window.location.origin;
    const oauth = createAuth0(
        {
            domain: config.domain,
            clientId: config.clientId,
            useRefreshTokens: true,
            useRefreshTokensFallback: true,
            cacheLocation: "memory",
            authorizationParams: {
                audience: config.audience,
                scope: "openid profile email offline_access",
                redirect_uri: webOrigin,
            },
        },
        { skipRedirectCallback: true },
    );
    app.use(oauth);
    currentOauth = oauth as AuthPlugin;
    return oauth as AuthPlugin;
}

/**
 * Finish auth setup (redirect callback, logout/login wrappers). Requires router; call after app.use(router).
 * Runs the OAuth callback and strips code/state from the URL once the router is active.
 */
async function finishAuth(
    _app: App<Element>,
    router: Router,
    oauth: AuthPlugin,
): Promise<void> {
    const webOrigin = window.location.origin;

    async function redirectCallback(_url: string) {
        const url = new URL(_url);
        if (!url.searchParams.has("state")) return false;
        if (url.searchParams.has("error")) {
            const error = url.searchParams.get("error");
            const errorDescription = url.searchParams.get("error_description");
            console.error("Auth0 callback error:", error, errorDescription);
            alert(`Login error: ${error}\n${errorDescription ?? ""}`);
            return false;
        }
        if (!url.searchParams.has("code")) return false;

        const callbackUrl = url.toString();
        const pathWithoutQuery = url.pathname || "/";

        // Strip callback params from the address bar immediately (and when we won't process, e.g. duplicate state)
        window.history.replaceState({}, document.title, pathWithoutQuery);

        const state = url.searchParams.get("state") ?? "";
        if (processedCallbackStates.has(state)) return false;
        processedCallbackStates.add(state);

        try {
            const result = await oauth.handleRedirectCallback(callbackUrl);
            const providerId = (result?.appState as { providerId?: string })
                ?.providerId;
            if (providerId) {
                sessionStorage.setItem(SESSION_PROVIDER_KEY, providerId);
            }
        } catch (err) {
            console.error("Auth0 callback handling failed:", err);
        }

        // Clean URL again in case the SDK overwrote it
        window.history.replaceState({}, document.title, pathWithoutQuery);
        router.push(pathWithoutQuery);
        return true;
    }

    await redirectCallback(location.href);

    const _Logout = oauth.logout;
    (oauth as AuthPlugin).logout = (retrying = false) => {
        clearAuth0Cache();
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
}

/**
 * Redirect the user to the login page.
 * Always shows the provider selection modal first; redirect to Auth0 only after the user selects a provider.
 * When there are no providers (e.g. only guest or sync not ready), show the modal and do not redirect.
 */
async function loginRedirect(_oauth: AuthPlugin) {
    const providers = await getAvailableProviders();
    if (providers.length >= 1) {
        showProviderSelectionModal.value = true;
        return;
    }

    // No providers to choose from (e.g. only guest in DB or sync not ready). Show modal so we do not redirect with a stale cached config.
    showProviderSelectionModal.value = true;
    return;
}

/**
 * Get the user's auth token. Redirect to login if necessary.
 * Waits for Auth0 to finish loading, then tries getAccessTokenSilently before showing the login modal
 * so we don't flash the modal on refresh or when returning from OAuth callback.
 */
async function getToken(oauth: AuthPlugin) {
    const { getAccessTokenSilently, isLoading } = oauth;

    if (isLoading.value) {
        await new Promise<void>((resolve) => {
            watch(isLoading, (v) => {
                if (!v) resolve();
            }, { once: true });
        });
    }
    await Promise.resolve();

    const tryGetToken = () => getAccessTokenSilently();

    try {
        return await tryGetToken();
    } catch {
        // Retry once after a short delay (SDK can lag after OAuth callback or refresh)
        await new Promise((r) => setTimeout(r, 150));
        try {
            return await tryGetToken();
        } catch (err) {
            Sentry.captureException(err);
            await loginRedirect(oauth);
        }
    }
}

export default {
    installAuth,
    finishAuth,
    loginRedirect,
    getToken,
};
