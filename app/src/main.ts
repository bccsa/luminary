import "./assets/main.css";
import { createApp } from "vue";
import { createPinia } from "pinia";
import * as Sentry from "@sentry/vue";
import App from "./App.vue";
import router from "./router";
import auth from "./auth";
import { db, DocType, getSocket, init, start } from "luminary-shared";
import { loadPlugins } from "./util/pluginLoader";
import { appLanguageIdsAsRef, initLanguage } from "./globalConfig";
import { apiUrl } from "./globalConfig";
import { initI18n } from "./i18n";
import { initAnalytics } from "./analytics";

// Close the IndexedDB connection when the window is closed. This attempts to prevent database lock issues.
window.onbeforeunload = () => {
    try {
        db.close();
    } catch (e) {
        console.error(e);
    }
};

export const app = createApp(App);

if (import.meta.env.VITE_FAV_ICON) {
    const favicon = document.getElementById("favicon") as HTMLLinkElement;
    if (favicon) {
        favicon.href = import.meta.env.VITE_LOGO_FAVICON;
    }
}

if (import.meta.env.PROD) {
    Sentry.init({
        app,
        dsn: import.meta.env.VITE_SENTRY_DSN,
        integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
    });
}

async function Startup() {
    await init({
        cms: false,
        docsIndex:
            "type, parentId, slug, language, docType, redirect, publishDate, expiryDate, [type+parentTagType+status], [type+parentPinned], [type+status], [type+docType]",
        apiUrl,
        appLanguageIdsAsRef,
        docTypes: [
            { type: DocType.Tag, contentOnly: true, syncPriority: 2 },
            { type: DocType.Post, contentOnly: true, syncPriority: 2 },
            {
                type: DocType.Language,
                contentOnly: false,
                syncPriority: 1,
                skipWaitForLanguageSync: true,
            },
        ],
    }).catch((err) => {
        console.error(err);
        Sentry.captureException(err);
    });

    const oauth = await auth.setupAuth(app, router);
    const token = await auth.getToken(oauth);

    await start(token);

    // Redirect to login if the API authentication fails
    getSocket().on("apiAuthFailed", async () => {
        console.error("API authentication failed, redirecting to login");
        Sentry.captureMessage("API authentication failed, redirecting to login");
        db.close();
        await auth.loginRedirect(oauth);
    });

    await initLanguage();
    const i18n = await initI18n();
    await loadPlugins();

    app.use(createPinia());
    app.use(router);
    app.use(i18n);
    app.mount("#app");
    initAnalytics();
}

Startup();
