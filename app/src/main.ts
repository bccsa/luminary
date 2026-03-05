import "./assets/main.css";
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import auth from "./auth";
import { DocType, init, updateAuthToken, warmMangoCaches } from "luminary-shared";
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

    app.use(createPinia());

    // Initialize DB and start sync before auth so getProviderConfig() can read
    // OAuthProvider docs from IndexedDB. Token is applied after auth is ready.
    await init({
        cms: false,
        docsIndex:
            "type, parentId, [parentId+status], slug, language, docType, redirect, publishDate, expiryDate, [type+status], [type+parentPinned], [type+parentPinned+status], [type+parentPinned+parentTagType], [parentType+parentTagType], [type+status+parentTagType], [type+parentType]",
        apiUrl,
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

    // Install Auth0 plugin before router so useAuth0() is available when router runs.
    // DB is now ready so getProviderConfig() can resolve the active provider from IndexedDB.
    const oauth = await auth.installAuth(app);
    app.use(router);
    await auth.finishAuth(app, router, oauth);

    const token = await auth.getToken(oauth);
    if (token) updateAuthToken(token);

    initLanguageSync();
    await initLanguage();
    initSync();

    // Refresh the auth token periodically to prevent expiry.
    // Auth0 access tokens typically last 24h; refreshing every 50 minutes
    // ensures connections always use a valid token.
    const TOKEN_REFRESH_MS = 50 * 60 * 1000;
    setInterval(async () => {
        const freshToken = await auth.getToken(oauth);
        if (freshToken) updateAuthToken(freshToken);
    }, TOKEN_REFRESH_MS);

    const i18n = await initI18n();
    await loadPlugins();

    app.use(i18n);
    app.mount("#app");
    initAppTitle(i18n);
    initAnalytics();
}

Startup().catch((err) => {
    console.error("Startup failed:", err);
    Sentry?.captureException(err);
});
