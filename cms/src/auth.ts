import { createAuth0 } from "@auth0/auth0-vue";
import { createAuth0Client } from "@auth0/auth0-spa-js";
import { type App, ref, watch } from "vue";
import type { Router } from "vue-router";
import * as Sentry from "@sentry/vue";
import { config, setTokenConfig, setAuthProviderGetter, getSocket } from "luminary-shared";
import { db, DocType } from "luminary-shared";
import type { AuthProviderDto } from "luminary-shared";

/**
 * Check if auth bypass mode is enabled (for development and E2E testing)
 */
export const isAuthBypassed = import.meta.env.VITE_AUTH_BYPASS === "true";

const GUEST_DOMAIN = "guest.auth0.com";
const GUEST_CLIENT_ID = "guest";
const GUEST_AUDIENCE = "https://guest";

/** Ref for the currently active OAuth provider document id (or null when guest). Used by shared HTTP to send x-auth-provider-id. */
export const activeProviderId = ref<string | null>(null);

/** When true, the provider selection modal should be shown. */
export const showProviderSelectionModal = ref(false);

/**
 * Mock auth plugin for bypass mode
 */
function createMockAuth() {
    return {
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
    } as any;
}

/**
 * Extract client_id from Auth0's native storage footprint (read-only).
 * Checks our explicit sessionStorage flag first (redirect callback), then localStorage (@@auth0spajs@@::*) for returning users.
 */
export function readAuth0NativeStorage(): { client_id: string } | null {
    if (typeof sessionStorage === "undefined" || typeof localStorage === "undefined") return null;

    // 1) SessionStorage: Check our explicit flag for the redirect callback
    const pendingClientId = sessionStorage.getItem("pending_provider");
    if (pendingClientId) {
        return { client_id: pendingClientId };
    }

    // 2) LocalStorage: cache keys @@auth0spajs@@::<client_id>::... (for returning users)
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith("@@auth0spajs@@::")) continue;
        const parts = key.split("::");
        if (parts.length >= 2 && parts[1]) return { client_id: parts[1] };
    }

    return null;
}

/** Wait until db.docs is ready (e.g. after init()). */
async function waitForDbReady(): Promise<void> {
    for (let i = 0; i < 100; i++) {
        try {
            await db.docs.count();
            return;
        } catch {
            await new Promise((r) => setTimeout(r, 50));
        }
    }
    throw new Error("auth: db.docs not ready");
}

/** Look up AuthProvider doc by clientId in Dexie. */
async function getProviderByClientId(clientId: string): Promise<AuthProviderDto | null> {
    const doc = await db.docs
        .where("type")
        .equals(DocType.AuthProvider)
        .filter((d) => (d as AuthProviderDto).clientId === clientId)
        .first();
    return (doc as AuthProviderDto) ?? null;
}

function buildAuth0Options(provider: AuthProviderDto | null) {
    const webOrigin = window.location.origin;
    if (provider) {
        return {
            domain: provider.domain,
            clientId: provider.clientId,
            useRefreshTokens: true,
            useRefreshTokensFallback: true,
            cacheLocation: "localstorage" as const,
            authorizationParams: {
                audience: provider.audience,
                scope: "openid profile email offline_access",
                redirect_uri: webOrigin,
            },
        };
    }
    return {
        domain: GUEST_DOMAIN,
        clientId: GUEST_CLIENT_ID,
        useRefreshTokens: false,
        cacheLocation: "localstorage" as const,
        authorizationParams: {
            audience: GUEST_AUDIENCE,
            scope: "openid profile email",
            redirect_uri: webOrigin,
        },
    };
}

export type AuthPlugin = Awaited<ReturnType<typeof setupAuth>>;

/**
 * Setup Auth0: wait for db, read footprint, resolve provider from Dexie, then install
 * createAuth0 (dummy config when no provider so useAuth0() never throws).
 * In bypass mode, returns a mock auth plugin.
 */
export async function setupAuth(app: App<Element>, router: Router) {
    if (isAuthBypassed) {
        console.warn(
            "⚠️ Auth bypass mode enabled - this should only be used for development/E2E testing",
        );
        const mockAuth = createMockAuth();
        app.config.globalProperties.$auth = mockAuth;
        setAuthProviderGetter(() => null);
        return mockAuth;
    }

    app.config.globalProperties.$auth = null;

    await waitForDbReady();

    const footprint = readAuth0NativeStorage();

    // Clean up immediately so it doesn't linger in session storage
    sessionStorage.removeItem("pending_provider");

    const provider = footprint ? await getProviderByClientId(footprint.client_id) : null;
    const options = buildAuth0Options(provider);

    const oauth = createAuth0(options, {
        skipRedirectCallback: true,
    });

    setAuthProviderGetter(() => activeProviderId.value ?? null);

    async function handleRedirectCallbackIfPresent(): Promise<{ handled: boolean; url: URL }> {
        const url = new URL(location.href);
        if (!url.searchParams.has("code") || !url.searchParams.has("state"))
            return { handled: false, url };
        if (url.searchParams.has("error")) {
            const err = url.searchParams.get("error");
            console.error("Auth0 callback error:", err);
            return { handled: false, url };
        }
        try {
            await oauth.handleRedirectCallback(location.href);
            return { handled: true, url };
        } catch (e) {
            Sentry?.captureException(e);
            return { handled: false, url };
        }
    }

    app.use(oauth);

    const { handled, url } = await handleRedirectCallbackIfPresent();
    if (handled) {
        const postFootprint = readAuth0NativeStorage();
        if (postFootprint) {
            const resolvedProvider = await getProviderByClientId(postFootprint.client_id);
            if (resolvedProvider) activeProviderId.value = resolvedProvider._id;
        }
        try {
            const token = await oauth.getAccessTokenSilently();
            if (token) {
                setTokenConfig(token);
                getSocket().setToken(token);
                getSocket().reconnect();
            }
        } catch {
            // not authenticated
        }
        const path = url.pathname + (url.hash || "");
        router.replace(path || "/").catch(() => {});
    } else if (provider) {
        activeProviderId.value = provider._id;
        try {
            const token = await oauth.getAccessTokenSilently();
            if (token) {
                setTokenConfig(token);
                getSocket().setToken(token);
                getSocket().reconnect();
            }
        } catch {
            // Token refresh failed (e.g. refresh token expired) — reset and show the provider modal
            activeProviderId.value = null;
            openProviderModal();
        }
    }

    await new Promise<void>((resolve) => {
        if (!oauth.isLoading.value) {
            resolve();
            return;
        }
        const stop = watch(
            () => oauth.isLoading.value,
            (isLoading) => {
                if (!isLoading) {
                    stop();
                    resolve();
                }
            },
        );
    });

    // Intercept the SDK's login method. If no provider is active, show the modal instead.
    const originalLoginWithRedirect = oauth.loginWithRedirect;
    oauth.loginWithRedirect = async (opts?: any) => {
        if (!activeProviderId.value) {
            openProviderModal();
            return;
        }
        return originalLoginWithRedirect(opts);
    };

    return oauth;
}

/**
 * Trigger login with the given provider by creating a temporary Auth0 client and
 * calling loginWithRedirect(). On return, the app boot will use readAuth0NativeStorage()
 * to resolve the provider and complete the callback.
 */
const AUTH0_PROMPT_VALUES = ["none", "login", "consent", "select_account"] as const;
type Auth0Prompt = (typeof AUTH0_PROMPT_VALUES)[number];

export async function loginWithProvider(
    provider: AuthProviderDto,
    opts?: { prompt?: Auth0Prompt },
): Promise<void> {
    const webOrigin = window.location.origin;

    sessionStorage.setItem("pending_provider", provider.clientId);

    const client = await createAuth0Client({
        domain: provider.domain,
        clientId: provider.clientId,
        cacheLocation: "localstorage",
        authorizationParams: {
            audience: provider.audience,
            scope: "openid profile email offline_access",
            redirect_uri: webOrigin,
        },
    });
    await client.loginWithRedirect({
        authorizationParams: opts?.prompt ? { prompt: opts.prompt } : undefined,
    });
}

/**
 * Clear Auth0 native cache keys, active provider id, and shared token.
 * Use when switching provider or logging out.
 */
export function clearAuth0Cache(): void {
    activeProviderId.value = null;
    if (config) config.token = undefined;

    try {
        const socket = getSocket();
        socket.setToken("");
        socket.reconnect();
    } catch {
        // socket may not be initialized yet
    }

    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("@@auth0spajs@@")) keysToRemove.push(key);
    }
    for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key?.startsWith("a0.spajs.")) keysToRemove.push(key);
    }
    keysToRemove.forEach((k) => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
    });
}

/** Open the provider selection modal (e.g. on apiAuthFailed). */
export function openProviderModal(): void {
    showProviderSelectionModal.value = true;
}

/**
 * Resolve active provider id from readAuth0NativeStorage() + Dexie and set activeProviderId.
 * Call after init() when db is ready.
 */
export async function resolveProviderId(): Promise<void> {
    const footprint = readAuth0NativeStorage();
    if (!footprint?.client_id) {
        activeProviderId.value = null;
        return;
    }
    try {
        const provider = await getProviderByClientId(footprint.client_id);
        activeProviderId.value = provider ? provider._id : null;
    } catch (e) {
        Sentry?.captureException(e);
        activeProviderId.value = null;
    }
}

export async function getToken(oauth: {
    isAuthenticated: { value: boolean };
    getAccessTokenSilently: () => Promise<string>;
}): Promise<string | undefined> {
    if (!oauth.isAuthenticated.value) return undefined;
    return oauth.getAccessTokenSilently();
}

export default {
    setupAuth,
    resolveProviderId,
    openProviderModal,
    clearAuth0Cache,
    readAuth0NativeStorage,
    activeProviderId,
    showProviderSelectionModal,
    loginWithProvider,
    isAuthBypassed,
    getToken,
};
