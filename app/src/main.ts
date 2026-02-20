import "./assets/main.css";
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import auth, { clearAuth0Cache } from "./auth";
import { DocType, getSocket, init, warmMangoCaches } from "luminary-shared";
import { loadPlugins } from "./util/pluginLoader";
import { appLanguageIdsAsRef, initLanguage, Sentry } from "./globalConfig";
import { apiUrl } from "./globalConfig";
import { initAppTitle, initI18n } from "./i18n";
import { initAnalytics } from "./analytics";
import { initSync, initLanguageSync } from "./sync";
import { useNotificationStore } from "./stores/notification";

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

    const oauth = await auth.setupAuth(app, router);

    const token = await auth.getToken(oauth);

    await init({
        cms: false,
        docsIndex:
            "type, parentId, slug, language, docType, redirect, publishDate, expiryDate, [type+parentPinned], [type+parentPinned+parentTagType], [parentType+parentTagType], [type+status+parentTagType], [type+parentType]",
        apiUrl,
        token,
        appLanguageIdsAsRef,
        syncList: [
            { type: DocType.OAuthProvider, contentOnly: false, syncPriority: 1 },
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

    // Handle API authentication failures – clear stale auth state and stay in guest mode
    // rather than aggressively redirecting (which causes a redirect loop).
    getSocket().on("apiAuthFailed", () => {
        console.error("API authentication failed, falling back to guest mode");
        Sentry?.captureMessage("API authentication failed, falling back to guest mode");

        // Clear any cached tokens and selected provider so the next explicit
        // login attempt starts fresh.
        clearAuth0Cache();
        localStorage.removeItem("selectedOAuthProviderId");

        // Show a notification so the user understands what happened.
        useNotificationStore().addNotification({
            title: "Login did not grant access",
            description:
                "We couldn't find any permissions for this login. Please sign in with a different provider.",
            state: "warning",
            type: "toast",
        });
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

Startup().catch((err) => {
    console.error("Startup failed:", err);
    Sentry?.captureException(err);
});
