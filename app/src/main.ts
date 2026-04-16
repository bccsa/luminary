import "./assets/main.css";
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import {
    setupAuth,
    resolveProviderId,
    openProviderModal,
    clearAuth0Cache,
    getLastSelectedProvider,
    loginWithProvider,
    stopTokenRefresh,
} from "@/auth";
import { DocType, getSocket, init, warmMangoCaches } from "luminary-shared";
import { loadPlugins } from "./util/pluginLoader";
import { appLanguageIdsAsRef, initLanguage, Sentry } from "./globalConfig";
import { apiUrl } from "./globalConfig";
import { initAppTitle, initI18n } from "./i18n";
import { initAnalytics } from "./analytics";
import { initSync, initAuthLangSync } from "./sync";
import { APP_DOCS_INDEX } from "./docsIndex";

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
        docsIndex: APP_DOCS_INDEX,
        apiUrl,
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

    const socket = getSocket();

    // Register the apiAuthFailed listener BEFORE setupAuth(), because setupAuth()
    // may connect the socket with an expired token — if the listener isn't ready
    // by then, the event is lost and the client loops forever.
    socket.on("connect_error", async (err: Error & { data?: { type?: string } }) => {
        if (err.data?.type !== "auth_failed" && err.message !== "auth_failed") return;
        Sentry?.captureMessage("API authentication failed");
        stopTokenRefresh();
        const lastProvider = await getLastSelectedProvider();
        clearAuth0Cache();
        socket.setAuth("", null);
        if (lastProvider) {
            await loginWithProvider(lastProvider, { prompt: "login" });
        } else {
            openProviderModal();
        }
    });

    await setupAuth(app, router);
    socket.connect(); // ensure socket connects for public users (no-op if auth already called reconnect())
    await resolveProviderId();

    initAuthLangSync();
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
