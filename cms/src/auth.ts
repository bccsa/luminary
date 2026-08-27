import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";
import { computed, ref } from "vue";
import * as Sentry from "@sentry/vue";
import { db, getSocket, removeCustomHeader, setCustomHeader } from "luminary-shared";
import type { AuthProviderDto } from "luminary-shared";

const OIDC_STATE_PREFIX = "oidc.";
const LEGACY_AUTH0_CACHE_PREFIX = "@@auth0spajs@@::";
const LEGACY_AUTH0_STATE_PREFIX = "a0.spajs.";

/** The selected provider, retained across the OIDC redirect. */
export const ACTIVE_PROVIDER_KEY = "cms_activeAuthProvider";

/**
 * One-shot flag: set when the user marks a sign-out as happening on a shared
 * device. Deliberately outside every prefix clearAuthCache() sweeps and never
 * matches ACTIVE_PROVIDER_KEY, so it survives clearAuthCache()/db.purge() and
 * is still there for whoever logs in next (see loginWithProvider). Consumed
 * (removed) the first time it's read.
 */
const FORCE_REAUTH_KEY = "cms_forceReauthOnNextLogin";

/** Currently active OAuth provider document id (or null when unauthenticated). */
export const activeProviderId = ref<string | null>(null);
/** When true, the provider selection modal should be shown. */
export const showProviderSelectionModal = ref(false);
/** True once an OIDC manager has been configured for the current provider (or bypass mode is on). */
export const isAuthPluginInstalled = ref(false);

type OidcPrompt = "none" | "login" | "consent" | "select_account";
export type ProviderConfig = Pick<AuthProviderDto, "_id" | "domain" | "clientId" | "audience">;
type PersistedProvider = ProviderConfig;
export type LogoutOptions = { forceReauthOnNextLogin?: boolean };

const oidcUser = ref<User | null>(null);
const isLoading = ref(false);
export const isAuthenticated = computed(() => !!oidcUser.value && !oidcUser.value.expired);
export const user = computed(() => oidcUser.value?.profile);

function clearStoragePrefix(storage: Storage, prefix: string): void {
    for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (key?.startsWith(prefix)) storage.removeItem(key);
    }
}

function markForceReauthOnNextLogin(): void {
    try {
        localStorage.setItem(FORCE_REAUTH_KEY, "true");
    } catch {
        // Storage is a hardening measure; logout must still proceed without it.
    }
}

/**
 * Auth0's `federated` logout param has no equivalent across arbitrary OIDC
 * providers, so instead of relying on provider-specific logout behaviour, the
 * next unprompted login is forced through `prompt=login` (standard OIDC
 * Core) — this makes the identity provider require fresh authentication even
 * if it (or an upstream provider it brokers to) still has a live session for
 * this browser, closing the "next person is silently logged in as the
 * previous user" gap regardless of which OIDC server is behind it.
 */
function consumeForceReauthOnNextLogin(): boolean {
    if (typeof localStorage === "undefined") return false;
    const wasSet = localStorage.getItem(FORCE_REAUTH_KEY) === "true";
    if (wasSet) localStorage.removeItem(FORCE_REAUTH_KEY);
    return wasSet;
}

function authority(domain: string): string {
    const withScheme =
        domain.startsWith("http://") || domain.startsWith("https://")
            ? domain
            : `https://${domain}`;
    // A trailing slash survives into `${authority}/.well-known/openid-configuration`,
    // which some providers 404 on.
    let end = withScheme.length;
    while (end > 0 && withScheme[end - 1] === "/") end -= 1;
    return withScheme.slice(0, end);
}

function setProviderIdHeader(id: string | null): void {
    activeProviderId.value = id;
    if (id) setCustomHeader("x-auth-provider-id", id);
    else removeCustomHeader("x-auth-provider-id");
}

/**
 * Persist the complete non-secret OIDC client configuration. Unlike Auth0's
 * private cache-key format, a generic OIDC client has no portable key shape
 * from which client ID and resource can be reconstructed after IndexedDB is
 * evicted. This record is only provider metadata, never a token.
 */
export function persistActiveProvider(provider: PersistedProvider): void {
    if (typeof localStorage === "undefined") return;
    try {
        const persisted: PersistedProvider = {
            _id: provider._id,
            domain: provider.domain,
            clientId: provider.clientId,
            audience: provider.audience,
        };
        localStorage.setItem(ACTIVE_PROVIDER_KEY, JSON.stringify(persisted));
    } catch {
        // Storage is an optimisation; a redirect must still proceed without it.
    }
}

export function readPersistedProvider(): PersistedProvider | null {
    if (typeof localStorage === "undefined") return null;
    try {
        const provider = JSON.parse(localStorage.getItem(ACTIVE_PROVIDER_KEY) ?? "null");
        if (
            provider &&
            typeof provider._id === "string" &&
            typeof provider.domain === "string" &&
            typeof provider.clientId === "string" &&
            typeof provider.audience === "string"
        ) {
            return {
                _id: provider._id,
                domain: provider.domain,
                clientId: provider.clientId,
                audience: provider.audience,
            };
        }
    } catch {
        // Treat corrupt persisted state as no selected provider.
    }
    return null;
}

/**
 * Resolve the selected provider without depending on any identity-provider
 * cache convention. Pre-OIDC sessions only persisted `{ _id, domain }`, which
 * fails the shape check in readPersistedProvider and so is treated as no
 * selection — old Auth0 browser state is wiped and the user re-picks a
 * provider rather than being migrated (simpler than reconstructing clientId
 * from a provider-specific cache key).
 */
export async function resolveActiveProvider(): Promise<ProviderConfig | null> {
    const persisted = readPersistedProvider();
    if (persisted) return persisted;
    if (typeof localStorage === "undefined") return null;
    if (localStorage.getItem(ACTIVE_PROVIDER_KEY)) clearAuthCache();
    return null;
}

function createManager(provider: ProviderConfig): UserManager {
    return new UserManager({
        authority: authority(provider.domain),
        client_id: provider.clientId,
        redirect_uri: window.location.origin,
        post_logout_redirect_uri: window.location.origin,
        response_type: "code",
        scope: "openid profile email offline_access",
        // `audience` is the existing AuthProvider contract. It is passed as an
        // optional authorization parameter, which Auth0 uses and standards-
        // compliant providers ignore when they don't model resources — but a
        // *strict* provider could reject an unrecognized param outright rather
        // than ignore it. If a non-Auth0 provider ever needs to be onboarded,
        // check this first.
        extraQueryParams: provider.audience ? { audience: provider.audience } : undefined,
        userStore: new WebStorageStateStore({ store: window.localStorage }),
        // No silent_redirect_uri: the only silent-renewal path is the
        // refresh-token grant inside signinSilent() (see refreshTokenSilently).
        // If a stored user ever has no refresh_token, signinSilent() throws
        // instead of falling back to an iframe — intentional, not an oversight:
        // iframe silent-auth is largely dead under modern ITP/third-party-
        // cookie policies anyway, so the fallback (a visible re-login) is the
        // more reliable behavior in practice.
        automaticSilentRenew: false,
        monitorSession: false,
    });
}

let installedOidc: UserManager | null = null;
/**
 * Provider id of the current install, held next to `installedOidc` so a token and
 * the provider it came from are always written together. `activeProviderId` can
 * be cleared on its own to mark a sign-in as incomplete, so it cannot serve this
 * role.
 */
let installedProviderId: string | null = null;

function installManager(provider: ProviderConfig): UserManager {
    const manager = createManager(provider);
    installedOidc = manager;
    installedProviderId = provider._id;
    isAuthPluginInstalled.value = true;
    setProviderIdHeader(provider._id);
    // A superseded manager keeps emitting — a late signinSilent on the provider
    // the user just switched away from would otherwise write the shared user ref.
    manager.events.addUserLoaded((loadedUser) => {
        if (installedOidc !== manager) return;
        oidcUser.value = loadedUser;
    });
    manager.events.addUserUnloaded(() => {
        if (installedOidc !== manager) return;
        oidcUser.value = null;
    });
    return manager;
}

/** Set up the generic OIDC client and finish an authorization-code callback. */
export async function setupAuth(): Promise<void> {
    const url = new URL(location.href);
    const isCallback = url.searchParams.has("code") && url.searchParams.has("state");
    const cleanUrl = url.pathname + url.hash;

    const provider = await resolveActiveProvider();
    if (!provider) {
        // No provider selected yet. conditionalAuthGuard opens the provider
        // modal because no OIDC manager was installed. Nothing is left that can
        // redeem a code, and leaving it in the URL keeps an authorization code
        // in history and outbound Referer headers.
        if (isCallback) history.replaceState(history.state, "", cleanUrl);
        return;
    }

    const manager = installManager(provider);
    isLoading.value = true;
    let handled = false;
    try {
        if (isCallback) {
            try {
                oidcUser.value = await manager.signinRedirectCallback();
                handled = true;
            } catch (error) {
                // A refresh on the callback URL after it already succeeded once
                // retries the same, by-then-consumed code+state and always
                // throws here. Fall back to whatever session that first,
                // successful run already established instead of leaving the
                // user logged out.
                Sentry?.captureException(error);
                oidcUser.value = await manager.getUser();
            } finally {
                // Must run whether or not the callback succeeded: leaving
                // code+state in the URL means every subsequent load retries
                // and fails the exact same way, forever.
                history.replaceState(history.state, "", cleanUrl);
            }
        } else {
            oidcUser.value = await manager.getUser();
        }

        const ok = await refreshTokenSilently();
        if (!ok) {
            // Drop the provider id along with the missing token: main.ts reads it to
            // decide whether to open an anonymous socket, and an anonymous handshake
            // replaces the persisted accessMap and purges group-scoped local data.
            setProviderIdHeader(null);
            // CMS has no unauthenticated state — returning-user with an expired
            // refresh token gets prompted to re-login via the provider modal. A
            // just-completed callback already established a session, so it is not
            // prompted again.
            if (!handled) openProviderModal();
        }
    } catch (error) {
        Sentry?.captureException(error);
    } finally {
        isLoading.value = false;
    }
}

let refreshInFlight: Promise<boolean> | null = null;
let refreshInFlightManager: UserManager | null = null;

/**
 * Bound on one silent-refresh attempt: oidc-client-ts puts no timeout on the
 * refresh-token grant, and a request that never settles would hold the
 * single-flight slot for every later caller until the page reloads.
 */
const REFRESH_TIMEOUT_MS = 30_000;

function hasJwtSigningKey(token: string): boolean {
    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((part) => !part)) return false;
    try {
        const encoded = parts[0].replace(/-/g, "+").replace(/_/g, "/");
        const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
        const header = JSON.parse(atob(padded)) as { kid?: unknown };
        return typeof header.kid === "string" && header.kid.length > 0;
    } catch {
        return false;
    }
}

/**
 * Refresh through the provider's OIDC refresh-token flow. With `ignoreCache`,
 * always call `signinSilent()` so a server-rejected token cannot be replayed.
 *
 * Single-flighted: unlike the old Auth0 SDK, oidc-client-ts has no built-in
 * dedup, so two overlapping callers (e.g. a socket connect_error handler
 * re-entering while a foreground/visibility-triggered reconnect is also
 * refreshing) would each POST the same refresh_token. With rotation enabled
 * server-side, one succeeds and the other gets invalid_grant — an
 * intermittent, hard-to-reproduce logout. A later caller joins the call
 * already in flight instead of starting its own — but only when it's for the
 * same manager: if the provider changed mid-flight (a rapid provider switch),
 * `refreshInFlightManager` won't match the newly-installed one, so the new
 * caller starts its own refresh instead of joining a promise that resolves
 * against the now-stale provider.
 */
export async function refreshTokenSilently(opts?: {
    ignoreCache?: boolean;
    /** The API verifies RS256 JWTs through the provider JWKS, so a rejected-token retry must carry a kid. */
    requireJwt?: boolean;
}): Promise<boolean> {
    const manager = installedOidc;
    const providerId = installedProviderId;
    if (!manager || !providerId) return false;
    if (refreshInFlight && refreshInFlightManager === manager) return refreshInFlight;
    refreshInFlightManager = manager;
    refreshInFlight = (async () => {
        const attempt = async (): Promise<boolean> => {
            let current = opts?.ignoreCache ? null : await manager.getUser();
            if (!current || current.expired) current = await manager.signinSilent();
            if (!current?.access_token) return false;
            if (opts?.requireJwt && !hasJwtSigningKey(current.access_token)) return false;
            // A logout (cleared to null) or a provider switch may have superseded
            // this call while it was in flight — don't resurrect a session the user
            // already left, and never pair one provider's token with another's id.
            // Compared by provider id rather than manager identity so an ordinary
            // re-install of the same provider still counts as current.
            if (!installedOidc || installedProviderId !== providerId) return false;
            oidcUser.value = current;
            setCustomHeader("Authorization", `Bearer ${current.access_token}`);
            // Re-assert the id: the API rejects a token that arrives without its
            // provider, and the header may have been cleared while in flight.
            setProviderIdHeader(providerId);
            getSocket().setAuth(current.access_token, providerId);
            getSocket().reconnect();
            return true;
        };

        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                attempt().catch(() => false),
                new Promise<boolean>((resolve) => {
                    timeout = setTimeout(() => resolve(false), REFRESH_TIMEOUT_MS);
                }),
            ]);
        } finally {
            clearTimeout(timeout);
            // Only clear if this call is still the current one — a newer call
            // for a different (just-installed) manager may have already
            // replaced these while this one was still in flight.
            if (refreshInFlightManager === manager) {
                refreshInFlight = null;
                refreshInFlightManager = null;
            }
        }
    })();
    return refreshInFlight;
}

/** Start an OIDC authorization-code + PKCE redirect for a selected provider. */
export async function loginWithProvider(
    provider: ProviderConfig,
    opts?: { prompt?: OidcPrompt },
): Promise<void> {
    persistActiveProvider(provider);
    const manager = installManager(provider);
    await manager.clearStaleState();
    // Only fall back to the shared-device flag when the caller didn't already
    // request a specific prompt (session-recovery call sites already pass
    // prompt: "login" themselves) — otherwise the flag stays pending for the
    // actual next unprompted login instead of being consumed here for nothing.
    const prompt = opts?.prompt ?? (consumeForceReauthOnNextLogin() ? "login" : undefined);
    // `extraQueryParams` on a signin call REPLACES the manager-level object in
    // oidc-client-ts; using it for prompt would drop Auth0's API audience and
    // produce an opaque access token. `prompt` is a standard first-class option.
    await manager.signinRedirect(prompt ? { prompt } : {});
}

/** The auth surface used by guards and components; it is not SDK-specific. */
export function useAuth() {
    return {
        isLoading,
        isAuthenticated,
        user,
        loginWithRedirect: () => installedOidc?.signinRedirect(),
        logout: async (opts?: LogoutOptions) => {
            const manager = installedOidc;
            if (!manager) return;
            // Capture before clearAuthCache() wipes the persisted user, so the
            // signout request can still carry id_token_hint.
            const idTokenHint = oidcUser.value?.id_token;
            if (opts?.forceReauthOnNextLogin) markForceReauthOnNextLogin();
            // Clear local state before redirecting, not after: otherwise a stale
            // ACTIVE_PROVIDER_KEY could let a later boot silently re-auth via
            // signinSilent() if the redirect gets interrupted.
            clearAuthCache();
            // Full teardown of the user's group-scoped local data. Don't rely on
            // the anon socket reconnect + deleteRevoked() reactivity to trim it
            // down instead — that depends on accessMap/isConnected timing that a
            // still-alive SPA can't guarantee, whereas purge() is immediate.
            await db.purge();
            try {
                await manager.signoutRedirect({ id_token_hint: idTokenHint });
                // A successful redirect navigates away and reboots the app
                // cleanly on return, same as a normal login redirect —
                // conditionalAuthGuard opens the provider modal on that reboot
                // since no OIDC manager is installed anymore.
            } catch (error) {
                // Not every provider exposes end_session_endpoint (some Auth0
                // tenants don't), so this redirect can fail before navigating.
                console.error("OIDC signout redirect failed:", error);
                Sentry?.captureException(error);
                // No navigation is coming, so reboot locally instead: a fresh
                // load re-runs main.ts's Startup() exactly like a successful
                // redirect's return would — conditionalAuthGuard then opens the
                // provider modal, no stale in-SPA state to reconcile by hand.
                window.location.reload();
            }
        },
    };
}

/** Clear generic OIDC browser state, provider identity, and shared token. */
export function clearAuthCache(): void {
    installedOidc = null;
    installedProviderId = null;
    setProviderIdHeader(null);
    oidcUser.value = null;
    isAuthPluginInstalled.value = false;
    removeCustomHeader("Authorization");
    // Also drop the socket's own auth, or a later reconnect (elsewhere) would
    // still carry the old user's credentials. Not reconnecting here: this runs
    // at boot (pre-connect), on provider_not_found (about to re-pick), and on
    // logout (about to redirect or reload) — none of those want an extra
    // connect cycle competing with refreshTokenSilently()'s own reconnect().
    getSocket().setAuth("", null);
    // oidc-client-ts keeps both the user (`oidc.user:…`) and in-flight signin state
    // including the PKCE verifier (`oidc.<state-id>`) in localStorage, so the
    // `oidc.` sweep has to cover localStorage — `oidc.user:` alone leaves every
    // abandoned login's verifier behind. sessionStorage is swept too in case a
    // custom stateStore is ever configured.
    clearStoragePrefix(localStorage, OIDC_STATE_PREFIX);
    clearStoragePrefix(sessionStorage, OIDC_STATE_PREFIX);
    clearStoragePrefix(localStorage, LEGACY_AUTH0_CACHE_PREFIX);
    clearStoragePrefix(sessionStorage, LEGACY_AUTH0_STATE_PREFIX);
    try {
        localStorage.removeItem(ACTIVE_PROVIDER_KEY);
    } catch {
        // Storage may be unavailable.
    }
}

export function openProviderModal(): void {
    showProviderSelectionModal.value = true;
}

export default {
    setupAuth,
    openProviderModal,
    clearAuthCache,
    activeProviderId,
    showProviderSelectionModal,
    isAuthPluginInstalled,
    loginWithProvider,
    resolveActiveProvider,
    refreshTokenSilently,
};
