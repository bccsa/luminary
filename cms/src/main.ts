import "./assets/main.css";
import { createApp, watch } from "vue";
import { createPinia } from "pinia";
import * as Sentry from "@sentry/vue";
import App from "./App.vue";
import router from "./router";
import { DocType, getSocket, init } from "luminary-shared";
import { apiUrl, initLanguage } from "@/globalConfig";
import auth, { isAuthBypassed } from "./auth";
import { useNotificationStore } from "./stores/notification";
import { changeReqWarnings, changeReqErrors } from "luminary-shared";
import { initAuthLangSync, initSync } from "./sync";
import { CMS_DOCS_INDEX } from "./docsIndex";

const app = createApp(App);

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
        integrations: [],
    });
}

async function Startup() {
    await init({
        cms: true,
        docsIndex: CMS_DOCS_INDEX,
        apiUrl,
        syncList: [
            {
                type: DocType.AuthProvider,
                syncPriority: 1,
                skipWaitForLanguageSync: true,
            },
            {
                type: DocType.AuthProviderConfig,
                syncPriority: 1,
                skipWaitForLanguageSync: true,
            },
            {
                type: DocType.Tag,
                syncPriority: 2,
                skipWaitForLanguageSync: true,
            },
            {
                type: DocType.Post,
                syncPriority: 2,
                skipWaitForLanguageSync: true,
            },
            {
                type: DocType.Redirect,
                syncPriority: 2,
                skipWaitForLanguageSync: true,
            },
            {
                type: DocType.Language,
                syncPriority: 1,
                skipWaitForLanguageSync: true,
            },
            {
                type: DocType.Group,
                syncPriority: 1,
                skipWaitForLanguageSync: true,
            },
            {
                type: DocType.User,
                sync: false,
            },
            {
                type: DocType.Storage,
                sync: true,
                syncPriority: 1,
                skipWaitForLanguageSync: true,
            },
        ],
    }).catch((err) => {
        console.error(err);
        Sentry.captureException(err);
    });

    await auth.setupAuth(app, router);
    await auth.resolveProviderId();

    const socket = getSocket();
    socket.connect(); // ensure socket connects for public users (no-op if auth already called reconnect())

    // On auth failure: resolve the user's most recently selected provider BEFORE
    // clearing the cache, then redirect straight to that provider's login. If
    // we can't identify a previous provider, fall back to the selection modal.
    if (!isAuthBypassed) {
        socket.on("apiAuthFailed", async () => {
            Sentry.captureMessage("API authentication failed");
            const lastProvider = await auth.getLastSelectedProvider();
            auth.clearAuth0Cache();
            socket.setAuth("", null);
            socket.reconnect();
            if (lastProvider) {
                await auth.loginWithProvider(lastProvider, { prompt: "login" });
            } else {
                auth.openProviderModal();
            }
        });
    }

    // Show notification if a change request was rejected or accepted but has warnings
    watch([changeReqWarnings, changeReqErrors], ([warnings, errors]) => {
        if (warnings.length > 0) {
            useNotificationStore().addNotification({
                title: "Warning",
                description: warnings.join("\n"),
                state: "warning",
                timer: 60000,
            });
            changeReqWarnings.value = [];
        }

        if (errors.length > 0) {
            useNotificationStore().addNotification({
                title: "Error",
                description: errors.join("\n"),
                state: "error",
                timer: 60000,
            });
            changeReqErrors.value = [];
        }
    });

    initAuthLangSync();
    await initLanguage();
    initSync();

    app.use(createPinia());
    app.use(router);
    app.mount("#app");
}

Startup();
