import { createAuth0 } from "@auth0/auth0-vue";
import { createAuth0Client } from "@auth0/auth0-spa-js";
import { type App, ref } from "vue";
import * as Sentry from "@sentry/vue";
import { setCustomHeader, removeCustomHeader, getSocket } from "luminary-shared";
import { db, DocType } from "luminary-shared";
import type { AuthProviderDto } from "luminary-shared";

const AUTH0_CACHE_PREFIX = "@@auth0spajs@@::";
const AUTH0_TX_PREFIX = "a0.spajs.";
const AUTH0_TX_KEY_PREFIX = "a0.spajs.txs.";

/** Development / E2E testing bypass. */
export const isAuthBypassed = import.meta.env.VITE_AUTH_BYPASS === "true";

/** Currently active OAuth provider document id (or null when unauthenticated). */
export const activeProviderId = ref<string | null>(null);

/** When true, the provider selection modal should be shown. */
export const showProviderSelectionModal = ref(false);

/**
 * True once setupAuth has installed the Auth0 Vue plugin (or bypassed auth).
 * Check before calling useAuth0() to avoid the
 * `injection "Symbol($auth0)" not found` warning.
 */
export const isAuthPluginInstalled = ref(false);

type Auth0Prompt = "none" | "login" | "consent" | "select_account";
type ProviderConfig = Pick<AuthProviderDto, "_id" | "domain" | "clientId" | "audience">;

function clearStoragePrefix(storage: Storage, prefix: string): void {
    for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (key?.startsWith(prefix)) storage.removeItem(key);
    }
}

function setProviderIdHeader(id: string | null): void {
    activeProviderId.value = id;
    if (id) setCustomHeader("x-auth-provider-id", id);
    else removeCustomHeader("x-auth-provider-id");
}

/**
 * Identify the current provider by reading Auth0's own storage footprint and
 * looking it up in Dexie. Prefers the localStorage session cache; falls back
 * to the PKCE transaction key in sessionStorage, but only while we're on the
 * OAuth callback URL — without that gate, a stale txs key from an aborted
 * login would impersonate a real session and lock the user out of re-picking.
 */
export async function resolveActiveProvider(): Promise<AuthProviderDto | null> {
    if (typeof sessionStorage === "undefined" || typeof localStorage === "undefined") return null;

    let clientId: string | null = null;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(AUTH0_CACHE_PREFIX)) continue;
        clientId = key.slice(AUTH0_CACHE_PREFIX.length).split("::")[0] || null;
        if (clientId) break;
    }

    if (!clientId) {
        const params = new URLSearchParams(location.search);
        if (!params.has("code") || !params.has("state")) return null;
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (!key?.startsWith(AUTH0_TX_KEY_PREFIX)) continue;
            clientId = key.slice(AUTH0_TX_KEY_PREFIX.length) || null;
            if (clientId) break;
        }
        if (!clientId) return null;
    }

    const doc = await db.docs
        .where("type")
        .equals(DocType.AuthProvider)
        .filter((d) => (d as AuthProviderDto).clientId === clientId)
        .first();
    return (doc as AuthProviderDto) ?? null;
}

function buildAuth0Options(p: ProviderConfig) {
    return {
        domain: p.domain,
        clientId: p.clientId,
        useRefreshTokens: true,
        useRefreshTokensFallback: true,
        cacheLocation: "localstorage" as const,
        authorizationParams: {
            audience: p.audience,
            scope: "openid profile email offline_access",
            redirect_uri: window.location.origin,
        },
    };
}

// Module-level handle on the installed Auth0 plugin. Set by setupAuth, read by
// refreshTokenSilently so the socket's connect_error handler can ask the SDK
// for a fresh access token without a visible re-login.
let installedOauth: ReturnType<typeof createAuth0> | null = null;

/**
 * Setup Auth0: resolve the active provider, install createAuth0 if found, and
 * finish any in-flight redirect callback. In bypass mode, shortcircuit with a
 * mock token so E2E tests can run without real Auth0.
 */
export async function setupAuth(app: App<Element>): Promise<void> {
    if (isAuthBypassed) {
        console.warn(
            "⚠️ Auth bypass mode enabled - this should only be used for development/E2E testing",
        );
        setCustomHeader("Authorization", "Bearer mock-token-for-e2e-testing");
        isAuthPluginInstalled.value = true;
        return;
    }

    const provider = await resolveActiveProvider();
    if (!provider) {
        // Auth0 cache keys from a deleted provider (or a session that predates
        // the provider doc landing in Dexie) will linger in localStorage
        // forever without this — no other path cleans them up for a cold start.
        clearAuth0Cache();
        return;
    }

    const oauth = createAuth0(buildAuth0Options(provider), { skipRedirectCallback: true });
    app.use(oauth);
    installedOauth = oauth;
    isAuthPluginInstalled.value = true;
    setProviderIdHeader(provider._id);

    const url = new URL(location.href);
    let handled = false;
    if (url.searchParams.has("code") && url.searchParams.has("state")) {
        try {
            await oauth.handleRedirectCallback(location.href);
            handled = true;
        } catch (e) {
            Sentry?.captureException(e);
        }
    }

    const ok = await refreshTokenSilently();
    if (!ok && !handled) {
        // CMS has no unauthenticated state — returning-user with an expired
        // refresh token gets prompted to re-login via the provider modal.
        setProviderIdHeader(null);
        openProviderModal();
    }

    if (handled) {
        history.replaceState(history.state, "", url.pathname + (url.hash || "") || "/");
    }
}

/**
 * Ask Auth0 for a fresh access token via the refresh token, then push it to
 * the Authorization header and the socket. Returns true on success. Call from
 * the socket's connect_error handler before falling back to a visible
 * re-login — this is what `useRefreshTokens: true` is for.
 */
export async function refreshTokenSilently(): Promise<boolean> {
    if (!installedOauth) return false;
    try {
        const token = await installedOauth.getAccessTokenSilently();
        if (!token) return false;
        setCustomHeader("Authorization", `Bearer ${token}`);
        getSocket().setAuth(token, activeProviderId.value);
        getSocket().reconnect();
        return true;
    } catch {
        return false;
    }
}

/**
 * Trigger login with the given provider. Creates a temporary Auth0 client and
 * calls loginWithRedirect. On return, setupAuth picks up the session.
 */
export async function loginWithProvider(
    provider: ProviderConfig,
    opts?: { prompt?: Auth0Prompt },
): Promise<void> {
    // Evict stale PKCE transactions from aborted attempts so the next
    // callback matches the fresh code_verifier.
    clearStoragePrefix(sessionStorage, AUTH0_TX_PREFIX);
    const client = await createAuth0Client(buildAuth0Options(provider));
    await client.loginWithRedirect({
        authorizationParams: opts?.prompt ? { prompt: opts.prompt } : undefined,
    });
}

/**
 * Clear Auth0 native cache keys, active provider id, and shared token.
 * Use when switching provider or logging out.
 */
export function clearAuth0Cache(): void {
    setProviderIdHeader(null);
    removeCustomHeader("Authorization");
    clearStoragePrefix(localStorage, AUTH0_CACHE_PREFIX);
    clearStoragePrefix(sessionStorage, AUTH0_TX_PREFIX);
}

export function openProviderModal(): void {
    showProviderSelectionModal.value = true;
}

export default {
    setupAuth,
    openProviderModal,
    clearAuth0Cache,
    activeProviderId,
    showProviderSelectionModal,
    isAuthPluginInstalled,
    loginWithProvider,
    resolveActiveProvider,
    refreshTokenSilently,
    isAuthBypassed,
};
