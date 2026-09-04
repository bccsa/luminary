import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";
import { computed, ref, type App } from "vue";
import type { Router } from "vue-router";
import * as Sentry from "@sentry/vue";
import { db, getSocket, removeCustomHeader, setCustomHeader } from "luminary-shared";
import type { AuthProviderDto } from "luminary-shared";
import { ACTIVE_PROVIDER_KEY, LEGACY_AUTH0_CACHE_PREFIX, OIDC_USER_PREFIX } from "./authStorage";

export { ACTIVE_PROVIDER_KEY } from "./authStorage";

const OIDC_STATE_PREFIX = "oidc.";
const LEGACY_AUTH0_STATE_PREFIX = "a0.spajs.";

/**
 * One-shot flag: set when the user marks a sign-out as happening on a shared
 * device. Deliberately outside every prefix clearAuthCache() sweeps and never
 * matches ACTIVE_PROVIDER_KEY, so it survives clearAuthCache()/db.purge() and
 * is still there for whoever logs in next (see loginWithProvider). Consumed
 * (removed) the first time it's read.
 */
const FORCE_REAUTH_KEY = "forceReauthOnNextLogin";

/** Currently active OAuth provider document id (or null when unauthenticated). */
export const activeProviderId = ref<string | null>(null);
/** When true, the provider selection modal should be shown. */
export const showProviderSelectionModal = ref(false);
/** True once an OIDC manager has been configured for the current provider. */
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

/** Custom state round-tripped through the OIDC state store across a login redirect. */
type SigninState = { returnTo?: string };

function appBasePath(): string {
    const base = import.meta.env.BASE_URL || "/";
    return base.endsWith("/") ? base : `${base}/`;
}

/**
 * Router-relative location to come back to after a login redirect. `redirect_uri`
 * is pinned to the origin (providers allow-list it exactly), so the destination
 * has to travel separately and be restored client-side.
 */
export function currentReturnTo(): string | undefined {
    if (typeof location === "undefined") return undefined;
    const base = appBasePath();
    const path = location.pathname.startsWith(base)
        ? `/${location.pathname.slice(base.length)}`
        : location.pathname;
    // Starting a login from a callback URL would otherwise carry a spent
    // authorization code into the destination.
    const params = new URLSearchParams(location.search);
    params.delete("code");
    params.delete("state");
    const search = params.toString();
    return sanitizeReturnTo(`${path}${search ? `?${search}` : ""}${location.hash}`);
}

/**
 * Accept only app-internal paths. `//host` and `/\host` are read as
 * protocol-relative URLs by browsers, so they would navigate off-site.
 */
export function sanitizeReturnTo(value: unknown): string | undefined {
    if (typeof value !== "string" || !value.startsWith("/")) return undefined;
    if (value.startsWith("//") || value.startsWith("/\\")) return undefined;
    return value === "/" ? undefined : value;
}

/**
 * `state` rides in the local OIDC state store, never in the request to the
 * provider, so the destination cannot be tampered with in transit.
 */
function signinArgs(
    prompt: OidcPrompt | undefined,
    returnTo: string | undefined,
): { prompt?: OidcPrompt; state?: SigninState } {
    const destination = returnTo ?? currentReturnTo();
    return {
        ...(prompt ? { prompt } : {}),
        ...(destination ? { state: { returnTo: destination } } : {}),
    };
}

/**
 * Drop the one-time authorization-code credentials from the current history
 * entry. Leaving them behind keeps a redeemable code in history and in outbound
 * Referer headers.
 */
export function stripAuthCallbackParams(): void {
    const url = new URL(location.href);
    if (!url.searchParams.has("code") && !url.searchParams.has("state")) return;
    history.replaceState(history.state, "", url.pathname + url.hash);
}

/** Set up the generic OIDC client and finish an authorization-code callback. */
export async function setupAuth(_app: App<Element>, router: Router): Promise<void> {
    const url = new URL(location.href);
    const isCallback = url.searchParams.has("code") && url.searchParams.has("state");

    if (isCallback) {
        // The router captures location.href when it is created — before this runs,
        // whichever entry point is used — so its initial navigation restores the
        // query stripped below. Strip it again once that navigation has settled.
        void router.isReady().then(stripAuthCallbackParams);
    }

    const provider = await resolveActiveProvider();
    if (!provider) {
        // Nothing is left that can redeem the code, and leaving it in the URL
        // keeps an authorization code in history and outbound Referer headers.
        if (isCallback) stripAuthCallbackParams();
        return;
    }

    const manager = installManager(provider);
    isLoading.value = true;
    try {
        if (isCallback) {
            // setupAuth runs before app.use(router), so router.replace() treats
            // this as a duplicate of its uninitialised `/` route and leaves the
            // real browser URL unchanged. Capture the callback URL for the OIDC
            // client, then remove its one-time credentials directly from history.
            stripAuthCallbackParams();
            try {
                oidcUser.value = await manager.signinRedirectCallback(url.href);
                const returnTo = sanitizeReturnTo(
                    (oidcUser.value.state as SigninState | undefined)?.returnTo,
                );
                // The router's initial navigation targets the origin-level
                // `redirect_uri`, so the page the login started from has to be
                // restored once that navigation has settled.
                if (returnTo) {
                    void router
                        .isReady()
                        .then(() => router.replace(returnTo))
                        .catch((navigationError) => Sentry?.captureException(navigationError));
                }
            } catch (error) {
                // A refresh on the callback URL after it already succeeded once
                // retries the same, by-then-consumed code+state and always
                // throws here. Fall back to whatever session that first,
                // successful run already established instead of leaving the
                // user logged out.
                Sentry?.captureException(error);
                oidcUser.value = await manager.getUser();
            }
        } else {
            oidcUser.value = await manager.getUser();
        }
        // Only place that pushes the token onto the header/socket — needed on both branches.
        await refreshTokenSilently();
    } catch (error) {
        Sentry?.captureException(error);
    } finally {
        isLoading.value = false;
    }
}

let refreshInFlight: Promise<RefreshOutcome> | null = null;
let refreshInFlightManager: UserManager | null = null;

/**
 * Bound on one silent-refresh attempt: oidc-client-ts puts no timeout on the
 * refresh-token grant, and a request that never settles would hold the
 * single-flight slot for every later caller until the page reloads.
 */
const REFRESH_TIMEOUT_MS = 30_000;

/**
 * Why a silent refresh did not leave a usable session behind.
 *
 * The distinction that matters is `rejected` vs `unavailable`: only the first
 * means the stored credentials are dead. Discarding them on the second would
 * sign out a user whose refresh token was still perfectly good, because the
 * network happened to be poor.
 */
export type RefreshOutcome =
    /** A fresh token is installed and the socket has been re-authenticated. */
    | "refreshed"
    /** The provider refused the grant, or there was no session to refresh. */
    | "rejected"
    /** The provider could not be reached, or did not answer in time. */
    | "unavailable"
    /** A logout or provider switch overtook this call; the caller must not act. */
    | "superseded";

/**
 * oidc-client-ts throws `ErrorResponse` only when the token endpoint answered
 * with an OAuth error body. A 5xx, a non-JSON body, a timeout, or a failed
 * fetch all surface as some other error — none of which say anything about
 * whether the credentials are still valid.
 */
function classifyRefreshFailure(error: unknown): RefreshOutcome {
    // Matched on the name oidc-client-ts stamps for exactly this purpose, rather
    // than `instanceof`, which fails across a duplicated copy of the library.
    if (error instanceof Error && error.name === "ErrorResponse") return "rejected";
    return "unavailable";
}

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
export async function refreshTokenWithOutcome(opts?: {
    ignoreCache?: boolean;
    /** The API verifies RS256 JWTs through the provider JWKS, so a rejected-token retry must carry a kid. */
    requireJwt?: boolean;
}): Promise<RefreshOutcome> {
    const manager = installedOidc;
    const providerId = installedProviderId;
    // Nothing installed means there are no credentials to preserve either.
    if (!manager || !providerId) return "rejected";
    if (refreshInFlight && refreshInFlightManager === manager) return refreshInFlight;
    refreshInFlightManager = manager;
    refreshInFlight = (async () => {
        const attempt = async (): Promise<RefreshOutcome> => {
            let current = opts?.ignoreCache ? null : await manager.getUser();
            if (!current || current.expired) current = await manager.signinSilent();
            if (!current?.access_token) return "rejected";
            if (opts?.requireJwt && !hasJwtSigningKey(current.access_token)) return "rejected";
            // A logout (cleared to null) or a provider switch may have superseded
            // this call while it was in flight — don't resurrect a session the user
            // already left, and never pair one provider's token with another's id.
            // Compared by provider id rather than manager identity so an ordinary
            // re-install of the same provider still counts as current.
            if (!installedOidc || installedProviderId !== providerId) return "superseded";
            oidcUser.value = current;
            setCustomHeader("Authorization", `Bearer ${current.access_token}`);
            // Re-assert the id: the API rejects a token that arrives without its
            // provider, and the header may have been cleared while in flight.
            setProviderIdHeader(providerId);
            getSocket().setAuth(current.access_token, providerId);
            getSocket().reconnect();
            return "refreshed";
        };

        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                attempt().catch(classifyRefreshFailure),
                new Promise<RefreshOutcome>((resolve) => {
                    // A refresh that never settles says nothing about the
                    // credentials, so it must not be read as a refusal.
                    timeout = setTimeout(() => resolve("unavailable"), REFRESH_TIMEOUT_MS);
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

/** `refreshTokenWithOutcome` for callers that only need "is the session usable now". */
export async function refreshTokenSilently(opts?: {
    ignoreCache?: boolean;
    requireJwt?: boolean;
}): Promise<boolean> {
    return (await refreshTokenWithOutcome(opts)) === "refreshed";
}

/** Start an OIDC authorization-code + PKCE redirect for a selected provider. */
export async function loginWithProvider(
    provider: ProviderConfig,
    opts?: { prompt?: OidcPrompt; returnTo?: string },
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
    await manager.signinRedirect(signinArgs(prompt, opts?.returnTo));
}

/**
 * Synchronous check for whether a session exists on this device, safe to call before setupAuth() resolves. Used to auth-scope the response-cache key so the SSG anonymous seed isn't shown to a returning logged-in user.
 */
export function hasPersistedSession(): boolean {
    if (typeof localStorage !== "undefined") {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(OIDC_USER_PREFIX) || key?.startsWith(LEGACY_AUTH0_CACHE_PREFIX)) {
                return true;
            }
        }
    }
    return readPersistedProvider() !== null;
}

/** The auth surface used by guards and components; it is not SDK-specific. */
export function useAuth() {
    return {
        isLoading,
        isAuthenticated,
        user,
        loginWithRedirect: (opts?: { returnTo?: string }) =>
            installedOidc?.signinRedirect(signinArgs(undefined, opts?.returnTo)),
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
                // cleanly on return, same as a normal login redirect.
            } catch (error) {
                // Not every provider exposes end_session_endpoint (some Auth0
                // tenants don't), so this redirect can fail before navigating.
                console.error("OIDC signout redirect failed:", error);
                Sentry?.captureException(error);
                // No navigation is coming, so reboot locally instead: a fresh
                // load re-runs main.ts's Startup() exactly like a successful
                // redirect's return would — anon socket connect, fresh
                // clientConfig/accessMap, no stale in-SPA state to reconcile
                // by hand (KeepAlive cache, sync watchers, composables, etc).
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

/**
 * Destination the pending provider pick should return to. Captured when the
 * modal opens rather than when the redirect starts, because the privacy-policy
 * gate can defer the pick across a route change.
 */
export const providerModalReturnTo = ref<string | undefined>(undefined);

export function openProviderModal(returnTo?: string): void {
    providerModalReturnTo.value = returnTo ?? currentReturnTo();
    showProviderSelectionModal.value = true;
}

export function closeProviderModal(): void {
    providerModalReturnTo.value = undefined;
    showProviderSelectionModal.value = false;
}

export default {
    setupAuth,
    openProviderModal,
    closeProviderModal,
    clearAuthCache,
    activeProviderId,
    showProviderSelectionModal,
    loginWithProvider,
    providerModalReturnTo,
    resolveActiveProvider,
    refreshTokenSilently,
    hasPersistedSession,
};
