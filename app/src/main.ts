import "./assets/main.css";
import { createApp } from "vue";
import { selectedProviderId } from "./stores/authProvider";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import auth from "./auth";
import { DocType, getSocket, init, warmMangoCaches } from "luminary-shared";
import { loadPlugins } from "./util/pluginLoader";
import { appLanguageIdsAsRef, initLanguage, Sentry } from "./globalConfig";
import { apiUrl } from "./globalConfig";
import { initAppTitle, initI18n } from "./i18n";
import { initAnalytics } from "./analytics";
import { initSync, initLanguageSync } from "./sync";

// Inject X-Query (provider ID) header on every fetch request to the API
const _nativeFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (selectedProviderId.value && url.startsWith(apiUrl)) {
        init = { ...init, headers: { ...((init?.headers as Record<string, string>) ?? {}), "X-Query": selectedProviderId.value } };
    }
    return _nativeFetch(input, init);
};

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
    // Install Pinia and router before auth so redirect callback and any plugin code
    // that runs during setupAuth can use stores and router without "reading _s of undefined".
    app.use(createPinia());
    app.use(router);

    // Pre-warm Mango query caches from localStorage before any queries run.
    // On the first visit this is a no-op; on subsequent loads it eliminates
    // cold-start compilation latency for IndexedDB queries.
    warmMangoCaches();

    const oauth = await auth.setupAuth(app, router);
    const token = await auth.getToken(oauth);

    await init({
        cms: false,
        docsIndex:
            "type, parentId, [parentId+status], slug, language, docType, redirect, publishDate, expiryDate, [type+status], [type+parentPinned], [type+parentPinned+status], [type+parentPinned+parentTagType], [parentType+parentTagType], [type+status+parentTagType], [type+parentType]",
        apiUrl,
        token,
        appLanguageIdsAsRef,
        syncList: [
            { type: DocType.OAuthProvider, syncPriority: 1 },
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

    // Redirect to login if the API authentication fails
    getSocket().on("apiAuthFailed", async () => {
        console.error("API authentication failed, redirecting to login");
        Sentry?.captureMessage("API authentication failed, redirecting to login");
        await auth.loginRedirect(oauth);
    });

    initLanguageSync();
    await initLanguage();
    initSync();

    const i18n = await initI18n();
    await loadPlugins();

    app.use(i18n);
    app.mount("#app");
    initAppTitle(i18n);
    initAnalytics();
}

Startup();
