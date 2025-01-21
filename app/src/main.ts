import "./assets/main.css";
import { createApp, ref, watch } from "vue";
import { createPinia } from "pinia";
import * as Sentry from "@sentry/vue";
import App from "./App.vue";
import router from "./router";
import auth from "./auth";
import {
    db,
    DocType,
    initLuminaryShared,
    useDexieLiveQuery,
    type LanguageDto,
} from "luminary-shared";
// @ts-expect-error matomo does not have a typescript definition file
import VueMatomo from "vue-matomo";
import { loadPlugins } from "./util/pluginLoader";
import { createI18n } from "vue-i18n";
import { appLanguageAsRef, initLanguage } from "./globalConfig";

// Startup
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

async function Startup() {
    await initLuminaryShared({
        cms: false,
        docsIndex:
            "type, parentId, slug, language, docType, redirect, publishDate, expiryDate, [type+parentTagType+language+status], [type+language+status+parentPinned], [type+language+status], [type+docType]",
    });
    // setup auth0
    app.config.globalProperties.$auth = null; // Clear existing auth
    const oauth = await auth.setupAuth(app, router);
    app.use(oauth);
    // wait to load plugins before mounting the app
    await loadPlugins();

    initLanguage();
}
await Startup();

// Initialize i18n with empty messages
const i18n = createI18n({
    legacy: false,
    locale: appLanguageAsRef.value?.languageCode || "en", // Default locale
    messages: {}, // Empty messages to start
});

// Get default language document. This should move to globalConfig.ts
const defaultLanguage = useDexieLiveQuery(
    () =>
        db.docs
            .where("type")
            .equals(DocType.Language)
            .and((doc) => {
                const languageDoc = doc as LanguageDto;
                return languageDoc.default == 1;
            })
            .first() as unknown as Promise<LanguageDto>,
);

// Create a list of localised strings with fallback to the default language if not existing in the preferred language
const localeInitDone = ref(false);
watch(
    [appLanguageAsRef, defaultLanguage],
    ([newLanguage, defaultLang]) => {
        // TODO: This watcher is triggering multiple times on app startup. Need to investigate why

        if (!newLanguage || !newLanguage.translations) return;

        // copy translations in the preferred language
        const messages: Record<string, string> = {};
        Object.keys(newLanguage.translations).forEach((k: string) => {
            messages[k] = newLanguage.translations[k];
        });

        // Fill in missing translations with default language strings
        if (defaultLang && defaultLang.translations && newLanguage._id != defaultLang._id) {
            Object.keys(defaultLang.translations).forEach((k: string) => {
                if (!messages[k]) {
                    messages[k] = defaultLang.translations[k];
                }
            });
        }

        // Add new translations to i18n
        i18n.global.setLocaleMessage(newLanguage.languageCode, messages);

        // Change the active locale
        i18n.global.locale.value = newLanguage.languageCode;

        localeInitDone.value = true;
    },
    { immediate: true },
);

app.use(createPinia());
app.use(router);
app.use(i18n);

// Wait for locale to be initialized before mounting the app
const appStartupHandler = watch(
    localeInitDone,
    (done) => {
        if (done) {
            app.mount("#app");
            appStartupHandler(); // Stop watching after app is mounted
        }
    },
    { immediate: true },
);

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
