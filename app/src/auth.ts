import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";
import { computed, ref, type App } from "vue";
import type { Router } from "vue-router";
import * as Sentry from "@sentry/vue";
import { db, getSocket, removeCustomHeader, setCustomHeader } from "luminary-shared";
import type { AuthProviderDto } from "luminary-shared";

const OIDC_USER_PREFIX = "oidc.user:";
const OIDC_STATE_PREFIX = "oidc.";
const LEGACY_AUTH0_CACHE_PREFIX = "@@auth0spajs@@::";
const LEGACY_AUTH0_STATE_PREFIX = "a0.spajs.";

/** The selected provider, retained across the OIDC redirect. */
export const ACTIVE_PROVIDER_KEY = "activeAuthProvider";

/** Currently active OAuth provider document id (or null when unauthenticated). */
export const activeProviderId = ref<string | null>(null);
/** When true, the provider selection modal should be shown. */
export const showProviderSelectionModal = ref(false);
/** True once an OIDC manager has been configured for the current provider. */
export const isAuthPluginInstalled = ref(false);

type OidcPrompt = "none" | "login" | "consent" | "select_account";
export type ProviderConfig = Pick<AuthProviderDto, "_id" | "domain" | "clientId" | "audience">;
type PersistedProvider = ProviderConfig;

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

function authority(domain: string): string {
    return /^https?:\/\//.test(domain) ? domain.replace(/\/$/, "") : `https://${domain}`;
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

function installManager(provider: ProviderConfig): UserManager {
    const manager = createManager(provider);
    installedOidc = manager;
    isAuthPluginInstalled.value = true;
    setProviderIdHeader(provider._id);
    manager.events.addUserLoaded((loadedUser) => {
        oidcUser.value = loadedUser;
    });
    manager.events.addUserUnloaded(() => {
        oidcUser.value = null;
    });
    return manager;
}

/** Set up the generic OIDC client and finish an authorization-code callback. */
export async function setupAuth(_app: App<Element>, router: Router): Promise<void> {
    const provider = await resolveActiveProvider();
    if (!provider) return;

    const manager = installManager(provider);
    isLoading.value = true;
    try {
        const url = new URL(location.href);
        const isCallback = url.searchParams.has("code") && url.searchParams.has("state");
        if (isCallback) {
            try {
                oidcUser.value = await manager.signinRedirectCallback();
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
                router.replace(url.pathname + (url.hash || "") || "/").catch(() => {});
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

let refreshInFlight: Promise<boolean> | null = null;
let refreshInFlightManager: UserManager | null = null;

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
export async function refreshTokenSilently(opts?: { ignoreCache?: boolean }): Promise<boolean> {
    const manager = installedOidc;
    if (!manager) return false;
    if (refreshInFlight && refreshInFlightManager === manager) return refreshInFlight;
    refreshInFlightManager = manager;
    refreshInFlight = (async () => {
        try {
            let current = opts?.ignoreCache ? null : await manager.getUser();
            if (!current || current.expired) current = await manager.signinSilent();
            if (!current?.access_token) return false;
            // A logout may have superseded this call while it was in flight —
            // don't resurrect a session the user already left. Checked as
            // "cleared to null", not "reassigned to something else": the latter
            // also matches ordinary reassignment (e.g. a fresh installManager()
            // for the same provider), which would wrongly reject a perfectly
            // healthy refresh.
            if (!installedOidc) return false;
            oidcUser.value = current;
            setCustomHeader("Authorization", `Bearer ${current.access_token}`);
            getSocket().setAuth(current.access_token, activeProviderId.value);
            getSocket().reconnect();
            return true;
        } catch {
            return false;
        } finally {
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
    await manager.signinRedirect({
        extraQueryParams: opts?.prompt ? { prompt: opts.prompt } : undefined,
    });
}

/** The auth surface used by guards and components; it is not SDK-specific. */
export function useAuth() {
    return {
        isLoading,
        isAuthenticated,
        user,
        loginWithRedirect: () => installedOidc?.signinRedirect(),
        logout: async () => {
            const manager = installedOidc;
            if (!manager) return;
            // Capture before clearAuthCache() wipes the persisted user, so the
            // signout request can still carry id_token_hint.
            const idTokenHint = oidcUser.value?.id_token;
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
    clearStoragePrefix(localStorage, OIDC_USER_PREFIX);
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
    loginWithProvider,
    resolveActiveProvider,
    refreshTokenSilently,
};
