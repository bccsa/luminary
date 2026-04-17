import { createAuth0 } from "@auth0/auth0-vue";
import { createAuth0Client } from "@auth0/auth0-spa-js";
import { type App, ref, watch } from "vue";
import * as Sentry from "@sentry/vue";
import { setCustomHeader, removeCustomHeader, getSocket } from "luminary-shared";
import { db, DocType } from "luminary-shared";
import type { AuthProviderDto } from "luminary-shared";

/**
 * Check if auth bypass mode is enabled (for development and E2E testing)
 */
export const isAuthBypassed = import.meta.env.VITE_AUTH_BYPASS === "true";

/** Ref for the currently active OAuth provider document id (or null when unauthenticated). Used by shared HTTP to send x-auth-provider-id. */
export const activeProviderId = ref<string | null>(null);

/** When true, the provider selection modal should be shown. */
export const showProviderSelectionModal = ref(false);

/**
 * True once `setupAuth` has installed the Auth0 Vue plugin (or a mock in bypass
 * mode). Callers should check this before calling `useAuth0()` to avoid the
 * `[Vue warn]: injection "Symbol($auth0)" not found` noise and the
 * `"Please ensure Auth0's Vue plugin is correctly installed"` throw.
 */
export const isAuthPluginInstalled = ref(false);

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

/** Look up AuthProvider doc by clientId in Dexie. */
async function getProviderByClientId(clientId: string): Promise<AuthProviderDto | null> {
    const doc = await db.docs
        .where("type")
        .equals(DocType.AuthProvider)
        .filter((d) => (d as AuthProviderDto).clientId === clientId)
        .first();
    return (doc as AuthProviderDto) ?? null;
}

/**
 * Fallback provider config persisted by loginWithProvider, so that setupAuth
 * can complete the callback even when Dexie hasn't re-synced the provider
 * (fresh session-after-logout, or after a transient deleteStaleProviderFromDexie).
 * Holds just enough fields to rebuild the Auth0 client in setupAuth.
 */
type PendingProviderConfig = Pick<
    AuthProviderDto,
    "_id" | "domain" | "audience" | "clientId"
>;

const PENDING_PROVIDER_CONFIG_KEY = "pending_provider_config";

function readPendingProviderConfig(clientId: string): PendingProviderConfig | null {
    try {
        const raw = sessionStorage.getItem(PENDING_PROVIDER_CONFIG_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PendingProviderConfig;
        if (parsed?.clientId !== clientId) return null;
        if (!parsed.domain || !parsed.audience || !parsed._id) return null;
        return parsed;
    } catch {
        return null;
    }
}

/**
 * Remove a potentially stale AuthProvider doc from the local Dexie cache.
 * Called when the server has told us this provider is either gone or out of
 * date; Dexie's live sync will then repopulate with the current server state.
 */
export async function deleteStaleProviderFromDexie(providerId: string | null): Promise<void> {
    if (!providerId) return;
    try {
        await db.docs.delete(providerId);
    } catch (e) {
        Sentry?.captureException(e);
    }
}

function buildAuth0Options(provider: Pick<AuthProviderDto, "domain" | "clientId" | "audience">) {
    return {
        domain: provider.domain,
        clientId: provider.clientId,
        useRefreshTokens: true,
        useRefreshTokensFallback: true,
        cacheLocation: "localstorage" as const,
        authorizationParams: {
            audience: provider.audience,
            scope: "openid profile email offline_access",
            redirect_uri: window.location.origin,
        },
    };
}

export type AuthPlugin = Awaited<ReturnType<typeof setupAuth>>;

/**
 * Setup Auth0: read the storage footprint, resolve the provider from Dexie, and
 * install createAuth0 only when a provider is found. With no provider the app
 * runs unauthenticated — consumers of useAuth0() must handle the undefined case.
 * In bypass mode, returns a mock auth plugin.
 */
export async function setupAuth(app: App<Element>) {
    if (isAuthBypassed) {
        console.warn(
            "⚠️ Auth bypass mode enabled - this should only be used for development/E2E testing",
        );
        const mockAuth = createMockAuth();
        app.config.globalProperties.$auth = mockAuth;
        setCustomHeader("Authorization", "Bearer mock-token-for-e2e-testing");
        isAuthPluginInstalled.value = true;
        return mockAuth;
    }

    app.config.globalProperties.$auth = null;

    const footprint = readAuth0NativeStorage();

    // Clean up immediately so it doesn't linger in session storage
    sessionStorage.removeItem("pending_provider");

    // Prefer Dexie (the authoritative source), but fall back to the config
    // persisted by loginWithProvider when Dexie hasn't synced the provider
    // doc yet. Without this fallback setupAuth silently bails when returning
    // from Auth0 if the provider was temporarily evicted from Dexie (e.g. by
    // deleteStaleProviderFromDexie earlier in the session), leaving
    // handleRedirectCallback unprocessed and the user unauthenticated.
    let provider: AuthProviderDto | PendingProviderConfig | null = null;
    if (footprint) {
        provider = await getProviderByClientId(footprint.client_id);
        if (!provider) provider = readPendingProviderConfig(footprint.client_id);
    }
    // One-shot use; clear regardless of whether Dexie or the fallback won.
    sessionStorage.removeItem(PENDING_PROVIDER_CONFIG_KEY);
    if (!provider) return undefined;

    const oauth = createAuth0(buildAuth0Options(provider), {
        skipRedirectCallback: true,
    });
    isAuthPluginInstalled.value = true;

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

    const effectiveProvider = handled
        ? await (async () => {
              const postFootprint = readAuth0NativeStorage();
              return postFootprint
                  ? await getProviderByClientId(postFootprint.client_id)
                  : null;
          })()
        : provider;

    if (effectiveProvider) {
        activeProviderId.value = effectiveProvider._id;
        setCustomHeader("x-auth-provider-id", effectiveProvider._id);
    }

    try {
        const token = await oauth.getAccessTokenSilently();
        if (token) {
            setCustomHeader("Authorization", `Bearer ${token}`);
            getSocket().setAuth(token, activeProviderId.value);
            getSocket().reconnect();
            startTokenRefresh(oauth);
        }
    } catch {
        // The CMS has no unauthenticated state — on token failure (e.g. expired
        // refresh token) for the returning-user path, reset and prompt re-login.
        if (!handled) {
            activeProviderId.value = null;
            openProviderModal();
        }
    }

    if (handled) {
        const path = (url.pathname + (url.hash || "")) || "/";
        history.replaceState(history.state, "", path);
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
    // Evict any in-flight Auth0 transactions from previously aborted login
    // attempts (e.g. the user hit Back while on the Auth0 page). Leaving them
    // around causes handleRedirectCallback to pick up a stale code_verifier /
    // state on the next callback and fail silently — requiring an extra login
    // click before the user is authenticated.
    // Only clears sessionStorage a0.spajs.* transaction keys; the localStorage
    // @@auth0spajs@@::* keys holding completed sessions are untouched.
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key?.startsWith("a0.spajs.")) sessionStorage.removeItem(key);
    }

    sessionStorage.setItem("pending_provider", provider.clientId);

    // Persist just enough provider state for setupAuth to resume on return,
    // even if the provider doc isn't in Dexie at that moment. See
    // readPendingProviderConfig / setupAuth for the matching read path.
    const pendingConfig: PendingProviderConfig = {
        _id: provider._id,
        domain: provider.domain,
        audience: provider.audience,
        clientId: provider.clientId,
    };
    sessionStorage.setItem(PENDING_PROVIDER_CONFIG_KEY, JSON.stringify(pendingConfig));

    const client = await createAuth0Client(buildAuth0Options(provider));
    await client.loginWithRedirect({
        authorizationParams: opts?.prompt ? { prompt: opts.prompt } : undefined,
    });
}

/**
 * Clear Auth0 native cache keys, active provider id, and shared token.
 * Use when switching provider or logging out. Callers are responsible for
 * refreshing any downstream state (e.g. reconnecting the socket) afterwards.
 */
export function clearAuth0Cache(): void {
    activeProviderId.value = null;
    removeCustomHeader("Authorization");
    removeCustomHeader("x-auth-provider-id");

    // NOTE: these storage key prefixes are specific to the Auth0 SPA SDK. If we
    // add non-Auth0 OIDC providers, this cleanup will need to be made generic
    // (or delegated to each provider adapter).
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
 * Resolve the auth provider the user most recently used by reading the Auth0
 * storage footprint and looking it up in Dexie. Call BEFORE clearAuth0Cache(),
 * otherwise the footprint will have been wiped.
 */
export async function getLastSelectedProvider(): Promise<AuthProviderDto | null> {
    const footprint = readAuth0NativeStorage();
    if (!footprint?.client_id) return null;
    try {
        return await getProviderByClientId(footprint.client_id);
    } catch (e) {
        Sentry?.captureException(e);
        return null;
    }
}

/**
 * Resolve active provider id from readAuth0NativeStorage() + Dexie and set activeProviderId.
 * Call after init() when db is ready.
 */
export async function resolveProviderId(): Promise<void> {
    const footprint = readAuth0NativeStorage();
    if (!footprint?.client_id) {
        activeProviderId.value = null;
        removeCustomHeader("x-auth-provider-id");
        return;
    }
    try {
        const provider = await getProviderByClientId(footprint.client_id);
        if (provider) {
            activeProviderId.value = provider._id;
            setCustomHeader("x-auth-provider-id", provider._id);
        } else {
            activeProviderId.value = null;
            removeCustomHeader("x-auth-provider-id");
        }
    } catch (e) {
        Sentry?.captureException(e);
        activeProviderId.value = null;
        removeCustomHeader("x-auth-provider-id");
    }
}

// ── Proactive token refresh ─────────────────────────────────────────────────
// Auth0 access tokens expire (typically 1 hour). We refresh every 5 minutes
// so the socket and HTTP headers always carry a valid token.

const TOKEN_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
let tokenRefreshTimer: ReturnType<typeof setInterval> | null = null;

export function startTokenRefresh(oauth: {
    getAccessTokenSilently: () => Promise<string>;
}): void {
    stopTokenRefresh();
    tokenRefreshTimer = setInterval(async () => {
        try {
            const token = await oauth.getAccessTokenSilently();
            if (token) {
                setCustomHeader("Authorization", `Bearer ${token}`);
                getSocket().setAuth(token, activeProviderId.value);
            }
        } catch {
            // Token refresh failed — the apiAuthFailed socket event will handle redirect
        }
    }, TOKEN_REFRESH_INTERVAL_MS);
}

export function stopTokenRefresh(): void {
    if (tokenRefreshTimer) {
        clearInterval(tokenRefreshTimer);
        tokenRefreshTimer = null;
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
    deleteStaleProviderFromDexie,
    readAuth0NativeStorage,
    activeProviderId,
    showProviderSelectionModal,
    isAuthPluginInstalled,
    loginWithProvider,
    getLastSelectedProvider,
    isAuthBypassed,
    getToken,
};
