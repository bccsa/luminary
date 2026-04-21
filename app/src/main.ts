import "./assets/main.css";
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import {
    setupAuth,
    openProviderModal,
    clearAuth0Cache,
    resolveActiveProvider,
    loginWithProvider,
    refreshTokenSilently,
} from "@/auth";
import { appPluginsPlugin } from "@/core/plugin-registry";
import { DocType, getSocket, init, warmMangoCaches } from "luminary-shared";
import { loadPlugins } from "./util/pluginLoader";
import { appLanguageIdsAsRef, initLanguage, isAppLoading, Sentry } from "./globalConfig";
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
    socket.on(
        "connect_error",
        async (err: Error & { data?: { type?: string; reason?: string } }) => {
            if (err.data?.type !== "auth_failed" && err.message !== "auth_failed") return;

            const reason = err.data?.reason;

            // Provider was deleted / never existed: don't re-attempt login with
            // the cached provider (it'll loop). Force the user through provider
            // selection instead.
            if (reason === "provider_not_found") {
                clearAuth0Cache();
                socket.setAuth("", null);
                openProviderModal();
                return;
            }

            // Normal case: the access token expired. Ask the Auth0 SDK for a
            // fresh one via the refresh token — no redirect needed.
            if (await refreshTokenSilently()) return;

            // The refresh token itself is gone or rejected — need a visible
            // re-login.
            Sentry?.captureMessage("API authentication failed; silent refresh failed");
            const lastProvider = await resolveActiveProvider();
            clearAuth0Cache();
            socket.setAuth("", null);
            if (lastProvider) {
                await loginWithProvider(lastProvider, { prompt: "login" });
            } else {
                openProviderModal();
            }
        },
    );

    await setupAuth(app, router);
    socket.connect(); // ensure socket connects for public users (no-op if auth already called reconnect())

    // Install all plugins before mounting — components rendered during the
    // splash screen (e.g. SearchModal) call useI18n() at setup time.
    const i18n = initI18n();
    app.use(createPinia());
    app.use(router);
    app.use(i18n);
    app.use(appPluginsPlugin);
    app.mount("#app");

    initAuthLangSync();
    await initLanguage();
    initSync();
    await loadPlugins();

    isAppLoading.value = false;
    initAppTitle(i18n);
    initAnalytics();
}

Startup();
