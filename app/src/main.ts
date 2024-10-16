import "./assets/main.css";

import { createApp } from "vue";
import { createPinia } from "pinia";

// import { createAuth0 } from "@auth0/auth0-vue";
import * as Sentry from "@sentry/vue";

import App from "./App.vue";
import router from "./router";
import setupAuth from "./auth";
import { initLuminaryShared } from "luminary-shared";
// @ts-expect-error matomo does not have a typescript definition file
import VueMatomo from "vue-matomo";

initLuminaryShared({ cms: false });

const app = createApp(App);

if (import.meta.env.PROD) {
    Sentry.init({
        app,
        dsn: import.meta.env.VITE_SENTRY_DSN,
        integrations: [],
    });
}

app.use(createPinia());

app.use(router);

// auth0
async function g() {
    const oauth = await setupAuth(app, router);
    app.use(oauth);
}

g();

// Matomo Analytics
if (import.meta.env.VITE_ANALYTICS_HOST && import.meta.env.VITE_ANALYTICS_SITEID)
    app.use(VueMatomo, {
        host: import.meta.env.VITE_ANALYTICS_HOST,
        siteId: import.meta.env.VITE_ANALYTICS_SITEID,
        router: router,
    });

// Start analytics on initial load
// @ts-expect-error window is a native browser api, and matomo is attaching _paq to window
if (window._paq)
    // @ts-expect-error window is a native browser api, and matomo is attaching _paq to window
    window._paq.push(
        ["setCustomUrl", window.location.href],
        ["setDocumentTitle", document.title],
        ["trackPageView"],
        ["trackVisibleContentImpressions"],
    );

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

app.mount("#app");
