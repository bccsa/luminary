import "./assets/main.css";
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import { setupAuth, resolveProviderId, openProviderModal } from "@/auth";
import { DocType, getSocket, init, warmMangoCaches } from "luminary-shared";
import { loadPlugins } from "./util/pluginLoader";
import { appLanguageIdsAsRef, initLanguage, Sentry } from "./globalConfig";
import { apiUrl } from "./globalConfig";
import { initAppTitle, initI18n } from "./i18n";
import { initAnalytics } from "./analytics";
import { initSync, initLanguageSync } from "./sync";

export const app = createApp(App);

if (import.meta.env.VITE_FAV_ICON) {
    const favicon = document.getElementById("favicon") as HTMLLinkElement;
    if (favicon) {
        favicon.href = import.meta.env.VITE_LOGO_FAVICON;
    }
}

if (import.meta.env.PROD && Sentry) {
    Sentry.init({
        app,
        dsn: import.meta.env.VITE_SENTRY_DSN,
        integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
    });
}

async function Startup() {
    // Pre-warm Mango query caches from localStorage before any queries run.
    // On the first visit this is a no-op; on subsequent loads it eliminates
    // cold-start compilation latency for IndexedDB queries.
    warmMangoCaches();

    await init({
        cms: false,
        docsIndex:
            "type, parentId, [parentId+status], slug, language, docType, redirect, publishDate, expiryDate, [type+status], [type+parentPinned], [type+parentPinned+status], [type+parentPinned+parentTagType], [parentType+parentTagType], [type+status+parentTagType], [type+parentType]",
        apiUrl,
        token: undefined,
        appLanguageIdsAsRef,
        syncList: [
            {
                type: DocType.AuthProvider,
                contentOnly: false,
                syncPriority: 1,
                skipWaitForLanguageSync: true,
            },
            { type: DocType.Tag, contentOnly: true, syncPriority: 2 },
            { type: DocType.Post, contentOnly: true, syncPriority: 2 },
            {
                type: DocType.Language,
                syncPriority: 1,
                skipWaitForLanguageSync: true,
            },
            { type: DocType.Redirect, contentOnly: false, syncPriority: 3 },
            { type: DocType.Storage, contentOnly: false, syncPriority: 3 },
        ],
    }).catch((err) => {
        console.error(err);
        Sentry?.captureException(err);
    });

    await setupAuth(app, router);
    getSocket().connect(); // ensure socket connects for public users (no-op if auth already called reconnect())
    await resolveProviderId();

    getSocket().on("apiAuthFailed", () => {
        console.error("API authentication failed, opening provider selection");
        Sentry?.captureMessage("API authentication failed, opening provider selection");
        openProviderModal();
    });

    initLanguageSync();
    await initLanguage();
    initSync();

    const i18n = await initI18n();
    await loadPlugins();

    app.use(createPinia());
    app.use(router);
    app.use(i18n);
    app.mount("#app");
    initAppTitle(i18n);
    initAnalytics();
}

Startup();
