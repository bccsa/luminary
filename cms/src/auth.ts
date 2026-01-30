import { Auth0Plugin, createAuth0 } from "@auth0/auth0-vue";
import { type App, ref, watch } from "vue";
import type { Router } from "vue-router";
import * as Sentry from "@sentry/vue";

export type AuthPlugin = Auth0Plugin & {
    logout: (retrying?: boolean) => Promise<void>;
};

/**
 * Check if auth bypass mode is enabled (for development and E2E testing)
 */
export const isAuthBypassed = import.meta.env.VITE_AUTH_BYPASS === "true";

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

        await oauth.handleRedirectCallback(url.toString()).catch(() => null);

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
