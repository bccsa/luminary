import { Auth0Plugin, createAuth0 } from "@auth0/auth0-vue";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { type App, watch } from "vue";
import type { Router } from "vue-router";
import AuthBrowser from "./util/authBrowser";

const appId = import.meta.env.VITE_CAP_APPID;
const authDomain = import.meta.env.VITE_AUTH0_DOMAIN;

export type AuthPlugin = Auth0Plugin & {
    logout: (retrying?: boolean) => Promise<void>;
};

export default async function setupAuth(app: App<Element>, router: Router) {
    const app_scheme = `${appId}://${authDomain}/capacitor/${appId}`;
    const web_origin = window.location.origin;
    const platform = Capacitor.getPlatform();

    const oauth = createAuth0(
        {
            domain: authDomain,
            clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
            useRefreshTokens: true,
            useRefreshTokensFallback: platform === "web",
            cacheLocation: "localstorage",
            authorizationParams: {
                audience: import.meta.env.VITE_AUTH0_AUDIENCE,
                scope: "openid profile email offline_access",
                redirect_uri: platform === "web" ? web_origin : `${app_scheme}/callback`,
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
        await Browser.close().catch(() => void 0);

        const to = getRedirectTo() || "/";
        location.href = to;

        return true;
    }

    // Handle redirects, if user needs to login and open the app via link with slug
    function getRedirectTo(): string {
        const route = router.currentRoute.value;
        let to =
            (route.query.redirect_to as string) ||
            (new URLSearchParams(location.search).get("redirect_to") as string);
        if (!to || to === "/") {
            to = localStorage.getItem("redirect_to") || "";
        }
        return to;
    }

    // Handle redirects, if user needs to login and open the app via link with slug
    function storeRedirectTo(to?: string): string | false {
        to = to || getRedirectTo() || location.pathname;
        if (to && to !== "/") {
            try {
                localStorage.setItem("redirect_to", to);
            } catch (e) {
                // ignore
            }

            return to;
        }

        return false;
    }

    app.use(oauth);

    // Handle login
    if (platform === "web") {
        if ((await redirectCallback(location.href)) === false) {
            storeRedirectTo();
        }
    } else {
        CapApp.addListener("appUrlOpen", async ({ url }) => {
            if ((await redirectCallback(url)) === true) return;
            const parsedUrl = new URL(url);
            const parsedPath = parsedUrl.href.replace(parsedUrl.origin, "");

            storeRedirectTo(parsedPath);
            if (oauth.isAuthenticated.value && location.pathname !== parsedPath) {
                router.push(parsedPath).catch(() => {});
            }
        });
    }

    CapApp.addListener("resume", async () => {
        setTimeout(() => {
            if (!oauth.isLoading.value && !oauth.isAuthenticated.value) {
                location.reload();
            }
        }, 10000);
    });

    // Handle logout
    const _Logout = oauth.logout;
    (oauth as AuthPlugin).logout = (retrying = false) => {
        let returnTo = platform === "web" ? (retrying ? location.href : web_origin) : app_scheme;
        if (!retrying) returnTo += "?loggedOut";

        return _Logout({
            logoutParams: {
                returnTo,
            },
            openUrl: async (url) => {
                try {
                    if (platform === "ios") {
                        await AuthBrowser.open({ url });
                        location.reload();
                        return;
                    }
                    await Browser.open({
                        url,
                        windowName: "_self",
                    });
                } catch (error) {
                    console.error("Auth Browser open error on logout", error);
                    alert(error);
                    location.reload();
                }
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
            openUrl: async (url) => {
                try {
                    if (platform === "ios") {
                        const result = await AuthBrowser.open({ url });
                        await redirectCallback(result.result);
                        return;
                    }
                    await Browser.open({
                        url,
                        windowName: "_self",
                    });
                } catch (error) {
                    console.error("Auth Browser open error on login", error);
                    alert(error);
                    location.reload();
                }
            },
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
