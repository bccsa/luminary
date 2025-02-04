import "./assets/main.css";
import { createApp } from "vue";
import { createPinia } from "pinia";
import * as Sentry from "@sentry/vue";
import App from "./App.vue";
import router from "./router";
import auth, { type AuthPlugin } from "./auth";
import { DocType, api, initLuminaryShared } from "luminary-shared";
// @ts-expect-error matomo does not have a typescript definition file
import VueMatomo from "vue-matomo";
import { loadPlugins } from "./util/pluginLoader";
import { initLanguage } from "./globalConfig";
import { apiUrl } from "./globalConfig";
import { initI18n } from "./i18n";

export const app = createApp(App);

if (import.meta.env.VITE_FAV_ICON) {
    const favicon = document.getElementById("favicon") as HTMLLinkElement;
    if (favicon) {
        favicon.href = import.meta.env.VITE_LOGO_FAVICON;
    }
}

if (import.meta.env.PROD) {
    Sentry.init({
        app,
        dsn: import.meta.env.VITE_SENTRY_DSN,
        integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
    });
}

// Clear the auth0AuthFailedRetryCount if the user logs in successfully (if the app is not redirecting to the login page, we assume the user either logged out or the login was successful)
setTimeout(() => {
    localStorage.removeItem("auth0AuthFailedRetryCount");
}, 10000);

async function Startup() {
    const oauth = await auth.setupAuth(app, router);
    const token = await auth.getToken(oauth);

    await initLuminaryShared({
        cms: false,
        docsIndex:
            "type, parentId, slug, language, docType, redirect, publishDate, expiryDate, [type+parentTagType+status], [type+parentPinned], [type+status], [type+docType]",
    });

    // TODO: This can be simplified by moving the api init logic to initLuminaryShared
    // Initialize the api connection
    try {
        const _api = api({
            apiUrl,
            token,
            docTypes: [
                { type: DocType.Tag, contentOnly: true, syncPriority: 2 },
                { type: DocType.Post, contentOnly: true, syncPriority: 2 },
                { type: DocType.Language, contentOnly: false, syncPriority: 1 },
            ],
        });

        // ask for updated bulk docs
        const rest = _api.rest();
        rest.clientDataReq();

        const socket = _api.socket();

        // handle API authentication failed messages
        socket.on("apiAuthFailed", async () => {
            console.error("API authentication failed, redirecting to login");
            Sentry.captureMessage("API authentication failed, redirecting to login");

            await auth.loginRedirect(oauth);
        });
    } catch (err) {
        console.error(err);
        Sentry.captureException(err);
    }

    await initLanguage();
    const i18n = await initI18n();
    await loadPlugins();

    app.use(createPinia());
    app.use(router);
    app.use(i18n);
    app.mount("#app");
}

// Matomo Analytics
if (import.meta.env.VITE_ANALYTICS_HOST && import.meta.env.VITE_ANALYTICS_SITEID)
    app.use(VueMatomo, {
        host: import.meta.env.VITE_ANALYTICS_HOST,
        siteId: import.meta.env.VITE_ANALYTICS_SITEID,
        router: router,
    });

// Start analytics on initial load
router.afterEach((to) => {
    const fullPath = to.fullPath;
    const title = (to.meta.title as string) || (to.params.slug as string) || (to.path as string);
    if (
        // @ts-expect-error window is a native browser api, and matomo is attaching _paq to window
        window._paq &&
        !fullPath.match(/(\/settings|\/explore)\/index\/login\/\?code/i) &&
        !title.match(/^Home$|Loading...|Page not found/i)
    )
        // @ts-expect-error window is a native browser api, and matomo is attaching _paq to window
        window._paq.push(
            ["setCustomUrl", window.location.origin + fullPath],
            ["setDocumentTitle", title],
            ["trackPageView"],
            ["trackVisibleContentImpressions"],
        );
});

// register matomo service worker
if (import.meta.env.VITE_ANALYTICS_HOST && import.meta.env.VITE_ANALYTICS_SITEID) {
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register(
                `src/analytics/service-worker.js?matomo_server=${import.meta.env.VITE_ANALYTICS_HOST}`,
            );
        });
    }
} else {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
            for (const registration of registrations) {
                registration.unregister();
            }
        });
    }
}

Startup();
