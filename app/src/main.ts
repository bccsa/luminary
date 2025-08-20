import "./assets/main.css";
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import auth from "./auth";
import { DocType, getSocket, init } from "luminary-shared";
import { loadPlugins } from "./util/pluginLoader";
import { appLanguageIdsAsRef, initLanguage } from "./globalConfig";
import { apiUrl } from "./globalConfig";
import { initAppTitle, initI18n } from "./i18n";
import { initAnalytics } from "./analytics";

export const app = createApp(App);

if (import.meta.env.VITE_FAV_ICON) {
    const favicon = document.getElementById("favicon") as HTMLLinkElement;
    if (favicon) {
        favicon.href = import.meta.env.VITE_LOGO_FAVICON;
    }
}

async function reportError(error: any, message?: string) {
    if (import.meta.env.PROD) {
        try {
            const Sentry = await import("@sentry/vue");
            if (message) {
                Sentry.captureMessage(message);
            }
            Sentry.captureException(error);
        } catch (e) {
            console.error("Failed to load Sentry:", e);
        }
    }
}

if (import.meta.env.PROD) {
    import("@sentry/vue")
        .then((Sentry) => {
            Sentry.init({
                app,
                dsn: import.meta.env.VITE_SENTRY_DSN,
                integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
            });
        })
        .catch((e) => {
            console.error("Failed to initialize Sentry:", e);
        });
}

async function Startup() {
    const oauth = await auth.setupAuth(app, router);
    const token = await auth.getToken(oauth);

    await init({
        cms: false,
        docsIndex:
            "type, parentId, slug, language, docType, redirect, publishDate, expiryDate, [type+parentTagType+status], [type+parentPinned], [type+status], [type+docType]",
        apiUrl,
        token,
        appLanguageIdsAsRef,
        syncList: [
            { type: DocType.Tag, contentOnly: true, syncPriority: 2 },
            { type: DocType.Post, contentOnly: true, syncPriority: 2 },
            {
                type: DocType.Language,
                syncPriority: 1,
                skipWaitForLanguageSync: true,
            },
            { type: DocType.Redirect, contentOnly: false, syncPriority: 3 },
        ],
    }).catch((err) => {
        console.error(err);
        reportError(err);
    });

    // Redirect to login if the API authentication fails
    getSocket().on("apiAuthFailed", async () => {
        console.error("API authentication failed, redirecting to login");
        reportError("API authentication failed, redirecting to login");
        await auth.loginRedirect(oauth);
    });

    await initLanguage();
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
