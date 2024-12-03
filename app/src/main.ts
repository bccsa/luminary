import "./assets/main.css";

import { createApp, watch } from "vue";
import { createPinia } from "pinia";

// import { createAuth0 } from "@auth0/auth0-vue";
import * as Sentry from "@sentry/vue";

import App from "./App.vue";
import router from "./router";
import auth from "./auth";
import { initLuminaryShared } from "luminary-shared";
// @ts-expect-error matomo does not have a typescript definition file
import VueMatomo from "vue-matomo";
import { loadPlugins } from "./util/pluginLoader";
import { createI18n } from "vue-i18n";
import { appLanguageAsRef } from "./globalConfig";

// Initialize i18n with empty messages
const i18n = createI18n({
    legacy: false,
    locale: appLanguageAsRef.value?.languageCode || "en", // Default locale
    fallbackLocale: appLanguageAsRef.value?.languageCode || "en", // Fallback locale
    messages: {}, // Empty messages to start
});

// Watch `appLanguageAsRef` for changes and update i18n dynamically
watch(
    appLanguageAsRef,
    (newLanguage) => {
        const { languageCode, translations } = newLanguage || {};

        if (languageCode && translations) {
            // Add new translations to i18n
            i18n.global.setLocaleMessage(languageCode, translations);

            // Change the active locale
            i18n.global.locale.value = languageCode;
        }
    },
    { immediate: true },
);

if (import.meta.env.VITE_FAV_ICON) {
    const favicon = document.getElementById("favicon") as HTMLLinkElement;
    if (favicon) {
        favicon.href = import.meta.env.VITE_LOGO_FAVICON;
    }
}

export const app = createApp(App);

if (import.meta.env.PROD) {
    Sentry.init({
        app,
        dsn: import.meta.env.VITE_SENTRY_DSN,
        integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
    });
}

app.use(createPinia());

app.use(router);
app.use(i18n);

// Startup
async function Startup() {
    await initLuminaryShared({
        cms: false,
        docsIndex:
            "type, parentId, slug, language, docType, redirect, publishDate, expiryDate, [type+parentTagType+status], [type+parentPinned], [type+status], [type+docType]",
    });
    // setup auth0
    app.config.globalProperties.$auth = null; // Clear existing auth
    const oauth = await auth.setupAuth(app, router);
    app.use(oauth);
    // wait to load plugins before mounting the app
    await loadPlugins();

    app.mount("#app");
}

Startup();

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
