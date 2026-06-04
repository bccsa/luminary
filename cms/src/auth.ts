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

/**
 * localStorage key holding the active provider's identity. Persisting it next
 * to Auth0's own localStorage refresh-token cache lets resolveActiveProvider
 * recover `domain` + `_id` (which otherwise live only in the Dexie
 * AuthProvider doc) after IndexedDB is evicted but localStorage survives —
 * the iOS-Safari-ITP logout (issue #1671).
 */
export const ACTIVE_PROVIDER_KEY = "cms_activeAuthProvider";

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
export type ProviderConfig = Pick<AuthProviderDto, "_id" | "domain" | "clientId" | "audience">;

/**
 * The only provider fields not recoverable from Auth0's own storage after a
 * Dexie eviction. `clientId` and `audience` live in the Auth0 cache key, so we
 * never persist them — see {@link resolveActiveProvider}.
 */
type PersistedProvider = Pick<AuthProviderDto, "_id" | "domain">;

function clearStoragePrefix(storage: Storage, prefix: string): void {
    for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (key?.startsWith(prefix)) storage.removeItem(key);
    }
}

/**
 * Persist the active provider's `_id` + `domain` to localStorage — the only two
 * fields that aren't recoverable from Auth0's own storage after a Dexie
 * eviction. Best-effort: storage failures (quota, Safari private mode) must
 * never abort a login redirect, so they are swallowed — resolution just falls
 * back to the Dexie lookup.
 */
export function persistActiveProvider(p: PersistedProvider): void {
    if (typeof localStorage === "undefined") return;
    try {
        localStorage.setItem(ACTIVE_PROVIDER_KEY, JSON.stringify({ _id: p._id, domain: p.domain }));
    } catch {
        // ignore — persistence is an optimization, not a requirement
    }
}

/**
 * Read the persisted `{ _id, domain }`. Returns null when absent, corrupt, or
 * missing either field.
 */
export function readPersistedProvider(): PersistedProvider | null {
    if (typeof localStorage === "undefined") return null;
    try {
        const raw = localStorage.getItem(ACTIVE_PROVIDER_KEY);
        if (!raw) return null;
        const p = JSON.parse(raw);
        if (p && p._id && p.domain) return { _id: p._id, domain: p.domain };
        return null;
    } catch {
        return null;
    }
}

function setProviderIdHeader(id: string | null): void {
    activeProviderId.value = id;
    if (id) setCustomHeader("x-auth-provider-id", id);
    else removeCustomHeader("x-auth-provider-id");
}

/**
 * Identify the current provider by reading Auth0's own storage footprint, then
 * recovering its config. Prefers the localStorage session cache; falls back to
 * the PKCE transaction key in sessionStorage, but only while we're on the OAuth
 * callback URL — without that gate, a stale txs key from an aborted login would
 * impersonate a real session and lock the user out of re-picking.
 *
 * Once a clientId is known, the config (`domain`, `_id`, …) comes Dexie-first:
 * the AuthProvider doc is authoritative (so provider edits propagate) and we
 * write it through to localStorage. Only when Dexie has no match — typically
 * after IndexedDB eviction while the Auth0 refresh token survives in
 * localStorage (issue #1671) — do we fall back to the persisted copy, so the
 * session can still silently refresh instead of logging the user out.
 */
export async function resolveActiveProvider(): Promise<ProviderConfig | null> {
    if (typeof sessionStorage === "undefined" || typeof localStorage === "undefined") return null;

    // The standard Auth0 token cache key is `<prefix><clientId>::<audience>::<scope>`,
    // so clientId + audience are both recoverable from it. (The sibling id-token
    // key `<prefix><clientId>::@@user@@` has no audience segment — skip it.)
    let clientId: string | null = null;
    let audience: string | null = null;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(AUTH0_CACHE_PREFIX)) continue;
        const segments = key.slice(AUTH0_CACHE_PREFIX.length).split("::");
        if (!segments[0]) continue;
        clientId = segments[0];
        if (segments.length >= 3 && segments[1]) audience = segments[1];
        if (audience) break;
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
    if (doc) {
        const d = doc as AuthProviderDto;
        persistActiveProvider(d);
        return { _id: d._id, domain: d.domain, clientId: d.clientId, audience: d.audience };
    }

    // Dexie evicted: rebuild from the persisted `{ _id, domain }` plus the
    // clientId + audience still carried by the Auth0 cache key.
    const persisted = readPersistedProvider();
    if (persisted && audience) {
        return { _id: persisted._id, domain: persisted.domain, clientId, audience };
    }
    return null;
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
        // Don't destroy a possibly-valid Auth0 session just because Dexie has
        // no matching AuthProvider doc — IndexedDB can be evicted while the
        // localStorage refresh token survives (issue #1671), and wiping the
        // cache here would conflate "no provider doc right now" with "no
        // session." The router guard (conditionalAuthGuard) opens the provider
        // modal because no Auth0 plugin was installed, and the server's
        // `provider_not_found` connect_error path still wipes the cache if the
        // provider really is gone.
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
 * the Authorization header and the socket. Call from the socket's
 * `connect_error` handler before falling back to a visible re-login — this is
 * what `useRefreshTokens: true` is for.
 *
 * @param opts - Options for the refresh.
 * @param opts.ignoreCache - Pass `true` after the server has rejected a token.
 *   Otherwise Auth0's default `cacheMode: "on"` can hand back the same cached
 *   still-client-valid token (60s leeway) that the server just rejected, so
 *   we'd loop forever on any clock skew or server-side revocation.
 * @returns `true` on success, `false` otherwise.
 */
export async function refreshTokenSilently(opts?: { ignoreCache?: boolean }): Promise<boolean> {
    if (!installedOauth) return false;
    try {
        const token = await installedOauth.getAccessTokenSilently(
            opts?.ignoreCache ? { cacheMode: "off" } : undefined,
        );
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
    // Remember the chosen provider so a returning session can be resolved
    // without the Dexie AuthProvider doc (issue #1671).
    persistActiveProvider(provider);
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
    try {
        localStorage.removeItem(ACTIVE_PROVIDER_KEY);
    } catch {
        // ignore — storage may be unavailable
    }
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
