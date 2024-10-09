import "./assets/main.css";

import { createApp } from "vue";
import { createPinia } from "pinia";

import { createAuth0 } from "@auth0/auth0-vue";
import * as Sentry from "@sentry/vue";

import App from "./App.vue";
import router from "./router";
import { initLuminaryShared } from "luminary-shared";
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

app.use(
    createAuth0({
        domain: import.meta.env.VITE_AUTH0_DOMAIN,
        clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
        authorizationParams: {
            audience: import.meta.env.VITE_AUTH0_AUDIENCE,
            redirect_uri: window.location.origin,
            scope: "openid profile email offline_access",
        },
        cacheLocation: "localstorage",
        useRefreshTokens: true,
    }),
);

// Matomo Analytics
app.use(VueMatomo, {
    host: import.meta.env.VITE_ANALYTICS_HOST,
    siteId: import.meta.env.VITE_ANALYTICS_SITEID,
    router: router,
});

// Start analytics on initial load
window._paq.push(["setCustomUrl", window.location.href]);
window._paq.push(["setDocumentTitle", document.title]);
window._paq.push(["trackPageView"]);
window._paq.push(["trackVisibleContentImpressions"]);

// register matomo service worker
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register(
            `src/analytics/service-worker.js?matomo_server=${import.meta.env.VITE_ANALYTICS_HOST}`,
        );
    });
}

app.mount("#app");
