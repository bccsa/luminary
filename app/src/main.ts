import "./assets/main.css";
import { createApp } from "vue";
import { createPinia } from "pinia";
import * as Sentry from "@sentry/vue";
import App from "./App.vue";
import router from "./router";
import auth from "./auth";
import { DocType, getSocket, init } from "luminary-shared";
import { loadPlugins } from "./util/pluginLoader";
import { appLanguageIdsAsRef, initLanguage } from "./globalConfig";
import { apiUrl } from "./globalConfig";
import { initAppTitle, initI18n } from "./i18n";
import { initAnalytics } from "./analytics";
import postcss from "postcss";
//@ts-expect-error -- no declaration file
import doiuse from "doiuse";

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
    const token = await auth.getToken(oauth);

    await init({
        cms: false,
        docsIndex:
            "type, parentId, slug, language, docType, redirect, publishDate, expiryDate, [type+parentTagType+status], [type+parentPinned], [type+status], [type+docType]",
        apiUrl,
        token,
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

    // Redirect to login if the API authentication fails
    getSocket().on("apiAuthFailed", async () => {
        console.error("API authentication failed, redirecting to login");
        Sentry.captureMessage("API authentication failed, redirecting to login");
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
async function getInjectedCSS() {
    let css = "";
    document.querySelectorAll("style").forEach((style) => {
        css += style.innerText;
    });
    return css;
}

async function checkCSSCompatibility() {
    const css = await getInjectedCSS();
    if (css) {
        console.log("Extracted CSS:", css);
        postcss([
            doiuse({
                browsers: [
                    "chrome >= 96",
                    "firefox >= 94",
                    "edge >= 96",
                    "opera >= 81",
                    "safari >= 15",
                    "> 1%",
                ],
                onFeatureUsage: (usageInfo: any) => {
                    console.warn("Unsupported CSS:", usageInfo.message);
                },
            }),
        ])
            .process(css, { from: undefined })
            .catch((err) => {
                console.error("PostCSS processing error", err);
            });
    }
}

if (import.meta.env.DEV == true) {
    checkCSSCompatibility();
}
