import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";
import { computed, ref, type App } from "vue";
import type { Router } from "vue-router";
import * as Sentry from "@sentry/vue";
import { getSocket, removeCustomHeader, setCustomHeader } from "luminary-shared";
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
    if (localStorage.getItem(ACTIVE_PROVIDER_KEY)) clearAuth0Cache();
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
        // compliant providers may ignore when they do not model resources.
        extraQueryParams: provider.audience ? { audience: provider.audience } : undefined,
        userStore: new WebStorageStateStore({ store: window.localStorage }),
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
            oidcUser.value = await manager.signinRedirectCallback();
            router.replace(url.pathname + (url.hash || "") || "/").catch(() => {});
        } else {
            oidcUser.value = await manager.getUser();
            await refreshTokenSilently();
        }
    } catch (error) {
        Sentry?.captureException(error);
    } finally {
        isLoading.value = false;
    }
}

/**
 * Refresh through the provider's OIDC refresh-token flow. With `ignoreCache`,
 * always call `signinSilent()` so a server-rejected token cannot be replayed.
 */
export async function refreshTokenSilently(opts?: { ignoreCache?: boolean }): Promise<boolean> {
    if (!installedOidc) return false;
    try {
        let current = opts?.ignoreCache ? null : await installedOidc.getUser();
        if (!current || current.expired) current = await installedOidc.signinSilent();
        if (!current?.access_token) return false;
        oidcUser.value = current;
        setCustomHeader("Authorization", `Bearer ${current.access_token}`);
        getSocket().setAuth(current.access_token, activeProviderId.value);
        getSocket().reconnect();
        return true;
    } catch {
        return false;
    }
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
            if (!installedOidc) return;
            try {
                await installedOidc.signoutRedirect();
            } catch {
                clearAuth0Cache();
            }
        },
    };
}

/** Clear generic OIDC browser state, provider identity, and shared token. */
export function clearAuth0Cache(): void {
    installedOidc = null;
    setProviderIdHeader(null);
    oidcUser.value = null;
    isAuthPluginInstalled.value = false;
    removeCustomHeader("Authorization");
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
    clearAuth0Cache,
    activeProviderId,
    showProviderSelectionModal,
    loginWithProvider,
    resolveActiveProvider,
    refreshTokenSilently,
};
