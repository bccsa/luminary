import { Auth0Plugin, createAuth0 } from "@auth0/auth0-vue";
import { createAuth0Client } from "@auth0/auth0-spa-js";
import { type App, ref, watch } from "vue";
import type { Router } from "vue-router";
import * as Sentry from "@sentry/vue";
import type { OAuthProviderPublicDto } from "luminary-shared";
import { useAuthProviderStore } from "./stores/authProvider";

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
 * Setup the Auth0 plugin.
 */
async function setupAuth(app: App<Element>, router: Router) {
    app.config.globalProperties.$auth = null; // Clear existing auth
    const web_origin = window.location.origin;

    const oauth = createAuth0(
        {
            domain: import.meta.env.VITE_AUTH0_DOMAIN,
            clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
            useRefreshTokens: true,
            useRefreshTokensFallback: true,
            cacheLocation: "localstorage",
            authorizationParams: {
                audience: import.meta.env.VITE_AUTH0_AUDIENCE,
                scope: "openid profile email offline_access",
                redirect_uri: web_origin,
            },
        },
        {
            skipRedirectCallback: true,
        },
    );

    // Handle redirects (Save token to local storage)
    async function redirectCallback(_url: string) {
        const url = new URL(_url);
        if (!url.searchParams.has("state")) return false;

        if (url.searchParams.has("error")) {
            const error = url.searchParams.get("error");
            console.error(error);
            alert(error);
            return false;
        }

        if (!url.searchParams.has("code")) return false;

        const handleResult = await oauth.handleRedirectCallback(url.toString()).catch((err) => {
            // Invalid state (e.g. cookie cleared, new tab) or other callback errors: clean URL and go home
            Sentry.captureException(err);
            window.history.replaceState(null, "", window.location.pathname + window.location.hash);
            router.push("/");
            return null;
        });
        if (handleResult === null) return false;

        const to = getRedirectTo() || "/";

        // Remove query string parameters which were included in the callback. Note: Never do a hard-reload here, as it locks indexedDb in Safari due to the immediate reload
        router.push(to);

        return true;
    }

    // Handle redirects, if user needs to login and open the app via link with slug
    function getRedirectTo(): string {
        const route = router.currentRoute.value;
        return (
            (route.query.redirect_to as string) ||
            (new URLSearchParams(location.search).get("redirect_to") as string)
        );
    }

    app.use(oauth);

    // Handle login
    await redirectCallback(location.href);

    // Handle logout
    const _Logout = oauth.logout;
    (oauth as AuthPlugin).logout = (retrying = false) => {
        let returnTo = web_origin;
        if (!retrying) returnTo += "?loggedOut";

        return _Logout({
            logoutParams: {
                returnTo,
            },
        });
    };

    // Handle login
    const _LoginWithRedirect = oauth.loginWithRedirect;
    oauth.loginWithRedirect = () => {
        return _LoginWithRedirect({
            authorizationParams: location.search.includes("loggedOut")
                ? {
                      prompt: "login",
                  }
                : undefined,
        });
    };

    if (oauth.isLoading.value) {
        // await while loading:
        await new Promise((resolve) => {
            watch(oauth.isLoading, () => resolve(void 0), { once: true });
        });
    }

    return oauth as AuthPlugin;
}

/**
 * Redirect the user to the login page.
 */
async function loginRedirect(oauth: AuthPlugin) {
    const { loginWithRedirect, logout } = oauth;

    const usedConnection = localStorage.getItem("usedAuth0Connection");
    const retryCount = parseInt(localStorage.getItem("auth0AuthFailedRetryCount") || "0");

    // Try to login. If this fails (e.g. the user cancels the login), log the user out after the second attempt
    if (retryCount < 2) {
        localStorage.setItem("auth0AuthFailedRetryCount", (retryCount + 1).toString());
        await loginWithRedirect({
            authorizationParams: {
                connection: usedConnection ? usedConnection : undefined,
                redirect_uri: window.location.origin,
            },
        });
        return;
    }

    localStorage.removeItem("auth0AuthFailedRetryCount");
    localStorage.removeItem("usedAuth0Connection");
    await logout({ logoutParams: { returnTo: window.location.origin } });
}

/**
 * Get the user's auth token. Redirect to login if necessary.
 */
async function getToken(oauth: AuthPlugin) {
    const { isAuthenticated, getAccessTokenSilently } = oauth;

    if (isAuthenticated.value) {
        try {
            return await getAccessTokenSilently();
        } catch (err) {
            Sentry.captureException(err);
            await loginRedirect(oauth);
        }
    }
}

// Clear the auth0AuthFailedRetryCount if the user logs in successfully (if the app is not redirecting to the login page, we assume the user either logged out or the login was successful)
setTimeout(() => {
    localStorage.removeItem("auth0AuthFailedRetryCount");
}, 10000);

export default {
    setupAuth,
    loginRedirect,
    getToken,
};
