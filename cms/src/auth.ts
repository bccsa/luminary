import { Auth0Plugin, createAuth0 } from "@auth0/auth0-vue";
import { createAuth0Client } from "@auth0/auth0-spa-js";
import { type App, ref, watch } from "vue";
import type { Router } from "vue-router";
import * as Sentry from "@sentry/vue";
import type { OAuthProviderPublicDto } from "luminary-shared";
import { useAuthProviderStore } from "./stores/authProvider";

/**
 * localStorage key for persisting provider credentials across the Auth0 redirect cycle.
 * Kept until logout so token refresh works on subsequent loads.
 */
const SELECTED_PROVIDER_CREDS_KEY = "selectedProviderCredentials";

type PersistedProviderCredentials = {
    domain: string;
    clientId: string;
    audience?: string;
};

/**
 * Controls visibility of the provider selection modal.
 */
export const showProviderSelectionModal = ref(false);

/**
 * Clear all Auth0 tokens from localStorage so the next login prompts fresh credentials.
 */
export function clearAuth0Cache() {
    Object.keys(localStorage)
        .filter((k) => k.startsWith("@@auth0spajs@@") || k.startsWith("a0.spajs"))
        .forEach((k) => localStorage.removeItem(k));
}

/**
 * Log in using a specific OAuthProvider. Creates a provider-scoped Auth0 client
 * and redirects the user to Auth0 for authentication.
 */
export async function loginWithProvider(
    provider: OAuthProviderPublicDto,
    options: { prompt?: "none" | "login" | "consent" | "select_account" } = {},
) {
    if (!provider.domain || !provider.clientId) {
        console.error("Provider is missing domain or clientId", provider._id);
        return;
    }

    const store = useAuthProviderStore();
    store.setProvider(provider);

    // Persist credentials so we can handle the Auth0 redirect callback after page reload
    localStorage.setItem(
        SELECTED_PROVIDER_CREDS_KEY,
        JSON.stringify({
            domain: provider.domain,
            clientId: provider.clientId,
            audience: provider.audience,
        } satisfies PersistedProviderCredentials),
    );

    const client = await createAuth0Client({
        domain: provider.domain,
        clientId: provider.clientId,
        useRefreshTokens: true,
        cacheLocation: "localstorage",
        authorizationParams: {
            audience: provider.audience,
            scope: "openid profile email offline_access",
            redirect_uri: window.location.origin,
            ...(options.prompt ? { prompt: options.prompt } : {}),
        },
    });

    await client.loginWithRedirect();
}

export type AuthPlugin = Auth0Plugin & {
    logout: (retrying?: boolean) => Promise<void>;
};

/**
 * Check if auth bypass mode is enabled (for development and E2E testing)
 */
export const isAuthBypassed = import.meta.env.VITE_AUTH_BYPASS === "true";

/**
 * Stub auth plugin used when Auth0 env vars are not configured.
 * Always reports unauthenticated; the provider selection modal handles login.
 */
function createNoAuthPlugin(): AuthPlugin {
    return {
        isAuthenticated: ref(false),
        isLoading: ref(false),
        user: ref(null),
        idTokenClaims: ref(null),
        error: ref(null),
        loginWithRedirect: async () => {},
        loginWithPopup: async () => {},
        logout: async () => {},
        getAccessTokenSilently: async () => {
            throw new Error("No Auth0 domain configured");
        },
        getAccessTokenWithPopup: async () => {
            throw new Error("No Auth0 domain configured");
        },
        checkSession: async () => {},
        handleRedirectCallback: async () => ({ appState: {} }),
        install: () => {},
    } as unknown as AuthPlugin;
}

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

/**
 * Setup the Auth0 plugin.
 */
async function setupAuth(app: App<Element>, router: Router) {
    // If auth bypass is enabled, return a mock auth plugin
    if (isAuthBypassed) {
        console.warn(
            "⚠️ Auth bypass mode enabled - this should only be used for development/E2E testing",
        );
        const mockAuth = createMockAuth();
        app.config.globalProperties.$auth = mockAuth;
        return mockAuth;
    }

    const storedCredsJson = localStorage.getItem(SELECTED_PROVIDER_CREDS_KEY);
    if (storedCredsJson) {
        // We have persisted provider credentials — use them to create a real Auth0 plugin.
        // This handles both the post-redirect callback (code+state in URL) and subsequent
        // loads where we need silent token refresh from localStorage.
        const creds: PersistedProviderCredentials = JSON.parse(storedCredsJson);
        const web_origin = window.location.origin;

        const oauth = createAuth0(
            {
                domain: creds.domain,
                clientId: creds.clientId,
                useRefreshTokens: true,
                useRefreshTokensFallback: true,
                cacheLocation: "localstorage",
                authorizationParams: {
                    audience: creds.audience,
                    scope: "openid profile email offline_access",
                    redirect_uri: web_origin,
                },
            },
            { skipRedirectCallback: true },
        );

        app.use(oauth);

        // Handle the redirect callback if Auth0 returned a code+state
        const url = new URL(location.href);
        if (url.searchParams.has("code") && url.searchParams.has("state")) {
            if (url.searchParams.has("error")) {
                console.error("Auth0 redirect error:", url.searchParams.get("error"));
            } else {
                await oauth.handleRedirectCallback(location.href).catch((err) => {
                    console.error("Failed to handle Auth0 redirect callback", err);
                });
            }
            router.push("/");
        }

        if (oauth.isLoading.value) {
            await new Promise((resolve) => {
                watch(oauth.isLoading, () => resolve(void 0), { once: true });
            });
        }

        const _Logout = oauth.logout;
        (oauth as AuthPlugin).logout = (retrying = false) => {
            localStorage.removeItem(SELECTED_PROVIDER_CREDS_KEY);
            let returnTo = web_origin;
            if (!retrying) returnTo += "?loggedOut";
            return _Logout({ logoutParams: { returnTo } });
        };

        return oauth as AuthPlugin;
    }

    const noAuth = createNoAuthPlugin();
    app.config.globalProperties.$auth = noAuth;
    return noAuth;
}

/**
 * Get the user's auth token. Shows the provider selection modal if the token
 * cannot be obtained silently.
 */
async function getToken(oauth: AuthPlugin) {
    const { isAuthenticated, getAccessTokenSilently } = oauth;

    if (isAuthenticated.value) {
        try {
            return await getAccessTokenSilently();
        } catch (err) {
            Sentry.captureException(err);
            showProviderSelectionModal.value = true;
        }
    }
}

export default {
    setupAuth,
    getToken,
};
