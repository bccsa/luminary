import "./assets/main.css";
import { createApp } from "vue";
import { createPinia } from "pinia";
import * as Sentry from "@sentry/vue";
import App from "./App.vue";
import router from "./router";
import auth from "./auth";
import { DocType, getSocket, initLuminaryShared } from "luminary-shared";
import { loadPlugins } from "./util/pluginLoader";
import { appLanguageIds, initLanguage } from "./globalConfig";
import { apiUrl } from "./globalConfig";
import { initI18n } from "./i18n";
import { initAnalytics } from "./analytics";

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
    const oauth = await auth.setupAuth(app, router);
    console.log("got oauth");
    const token = await auth.getToken(oauth);
    console.log("got token");

    await initLuminaryShared({
        cms: false,
        docsIndex:
            "type, parentId, slug, language, docType, redirect, publishDate, expiryDate, [type+parentTagType+status], [type+parentPinned], [type+status], [type+docType]",
        apiUrl,
        token,
        appLanguageIdsAsRef: appLanguageIds,
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
    // console.log("luminary shared initialized");

    // Redirect to login if the API authentication fails
    getSocket().on("apiAuthFailed", async () => {
        console.error("API authentication failed, redirecting to login");
        Sentry.captureMessage("API authentication failed, redirecting to login");
        await auth.loginRedirect(oauth);
    });

    console.log("initLanguage from main.ts");
    await initLanguage();
    // console.log("language initialized");
    const i18n = await initI18n();
    console.log("i18n initialized");
    await loadPlugins();
    console.log("plugins loaded");

    app.use(createPinia());
    console.log("pinia initialized");
    app.use(router);
    console.log("router initialized");
    app.use(i18n);
    console.log("i18n added to app");
    app.mount("#app");
    console.log("app mounted");
    initAnalytics();
    console.log("analytics initialized");
}

Startup();
