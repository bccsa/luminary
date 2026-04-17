import { createAuth0 } from "@auth0/auth0-vue";
import { createAuth0Client } from "@auth0/auth0-spa-js";
import { type App, ref, watch } from "vue";
import type { Router } from "vue-router";
import * as Sentry from "@sentry/vue";
import { setCustomHeader, removeCustomHeader, getSocket } from "luminary-shared";
import { db, DocType } from "luminary-shared";
import type { AuthProviderDto } from "luminary-shared";

/** Ref for the currently active OAuth provider document id (or null when unauthenticated). Used by shared HTTP to send x-auth-provider-id. */
export const activeProviderId = ref<string | null>(null);

/** When true, the provider selection modal should be shown. */
export const showProviderSelectionModal = ref(false);

/**
 * True once `setupAuth` has installed the Auth0 Vue plugin. Callers should
 * check this before calling `useAuth0()` to avoid the
 * `[Vue warn]: injection "Symbol($auth0)" not found` noise and the
 * `"Please ensure Auth0's Vue plugin is correctly installed"` throw.
 */
export const isAuthPluginInstalled = ref(false);

/**
 * Extract client_id from Auth0's native storage footprint (read-only).
 * Checks localStorage (@@auth0spajs@@::*) for returning users, then the Auth0
 * SDK's in-flight transaction key in sessionStorage for the redirect callback.
 * Do not modify or rely on the OAuth state parameter; the SDK owns it for CSRF.
 */
export function readAuth0NativeStorage(): { client_id: string } | null {
    if (typeof sessionStorage === "undefined" || typeof localStorage === "undefined") return null;

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith("@@auth0spajs@@::")) continue;
        const parts = key.split("::");
        if (parts.length >= 2 && parts[1]) return { client_id: parts[1] };
    }

    // a0.spajs.txs.<clientId> is set by createAuth0Client().loginWithRedirect()
    // and survives across page loads until handleRedirectCallback consumes it.
    for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (!key?.startsWith("a0.spajs.txs.")) continue;
        const clientId = key.slice("a0.spajs.txs.".length);
        if (clientId) return { client_id: clientId };
    }

    return null;
}

/** Look up OAuthProvider doc by clientId in Dexie. */
async function getProviderByClientId(clientId: string): Promise<AuthProviderDto | null> {
    const doc = await db.docs
        .where("type")
        .equals(DocType.AuthProvider)
        .filter((d) => (d as AuthProviderDto).clientId === clientId)
        .first();
    return (doc as AuthProviderDto) ?? null;
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
 */
export async function setupAuth(app: App<Element>, router: Router) {
    app.config.globalProperties.$auth = null;

    const footprint = readAuth0NativeStorage();

    const provider = footprint
        ? await getProviderByClientId(footprint.client_id)
        : null;
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
        // The app has a valid unauthenticated state (public content), so swallow.
    }

    if (handled) {
        const path = url.pathname + (url.hash || "");
        router.replace(path || "/").catch(() => {});
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
 * to resolve the provider and complete the callback. Do not modify the OAuth state parameter.
 */
const AUTH0_PROMPT_VALUES = ["none", "login", "consent", "select_account"] as const;
type Auth0Prompt = (typeof AUTH0_PROMPT_VALUES)[number];

export async function loginWithProvider(
    provider: AuthProviderDto,
    opts?: { prompt?: Auth0Prompt },
): Promise<void> {
    const webOrigin = window.location.origin;

    // Evict any in-flight Auth0 PKCE transactions from previously aborted
    // login attempts (e.g. the user hit Back while on the Auth0 page). The
    // Auth0 SDK persists each loginWithRedirect's { code_verifier, state }
    // pair under a0.spajs.txs.<clientId> in sessionStorage so it can complete
    // the code-for-token exchange on return, but it does not clean up pairs
    // from aborted flows. If a stale pair is still present when the next
    // callback fires, handleRedirectCallback picks it up first and the PKCE
    // verifier won't match the fresh authorization code — the call fails
    // silently and the user has to click login a second time.
    // Only clears sessionStorage a0.spajs.* transaction keys; the localStorage
    // @@auth0spajs@@::* keys holding completed sessions are untouched.
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key?.startsWith("a0.spajs.")) sessionStorage.removeItem(key);
    }

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

/**
 * Get a token from the oauth client if the user is authenticated.
 * Returns undefined if not authenticated.
 */
export async function getToken(oauth: {
    isAuthenticated: { value: boolean };
    getAccessTokenSilently: () => Promise<string>;
}): Promise<string | undefined> {
    if (!oauth.isAuthenticated.value) return undefined;
    return oauth.getAccessTokenSilently();
}

/**
 * Resolve active provider id from readAuth0NativeStorage() + Dexie and set activeProviderId.
 * Call after init() when db is ready, and after callback handling.
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

export default {
    setupAuth,
    resolveProviderId,
    openProviderModal,
    clearAuth0Cache,
    deleteStaleProviderFromDexie,
    readAuth0NativeStorage,
    activeProviderId,
    showProviderSelectionModal,
    loginWithProvider,
    getToken,
};
