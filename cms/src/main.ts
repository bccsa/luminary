import "./assets/main.css";
import { createApp, watch } from "vue";
import { createPinia } from "pinia";
import * as Sentry from "@sentry/vue";
import App from "./App.vue";
import router from "./router";
import {
    changeReqErrors,
    changeReqWarnings,
    DocType,
    getSocket,
    init,
    serverError,
} from "luminary-shared";
import { apiUrl, initLanguage } from "@/globalConfig";
import auth, { isAuthBypassed } from "./auth";
import { useNotificationStore } from "./stores/notification";
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
                type: DocType.AutoGroupMappings,
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

    const socket = getSocket();

    // Register the apiAuthFailed listener BEFORE setupAuth(), because setupAuth()
    // may connect the socket with an expired token — if the listener isn't ready
    // by then, the event is lost and the client loops forever.
    if (!isAuthBypassed) {
        socket.on(
            "connect_error",
            async (err: Error & { data?: { type?: string; reason?: string } }) => {
                if (err.data?.type !== "auth_failed" && err.message !== "auth_failed") return;

                const reason = err.data?.reason;

                // Provider was deleted / never existed: don't re-attempt login
                // with the cached provider (it'll loop). Force the user through
                // provider selection instead.
                if (reason === "provider_not_found") {
                    auth.clearAuth0Cache();
                    socket.setAuth("", null);
                    auth.openProviderModal();
                    return;
                }

                // Normal case: the access token expired. Ask the Auth0 SDK for
                // a fresh one via the refresh token — no redirect needed.
                if (await auth.refreshTokenSilently()) return;

                // The refresh token itself is gone or rejected — need a
                // visible re-login.
                Sentry.captureMessage("API authentication failed; silent refresh failed");
                const lastProvider = await auth.resolveActiveProvider();
                auth.clearAuth0Cache();
                socket.setAuth("", null);
                if (lastProvider) {
                    await auth.loginWithProvider(lastProvider, { prompt: "login" });
                } else {
                    auth.openProviderModal();
                }
            },
        );
    }

<<<<<<< HEAD
    await auth.setupAuth(app);
    socket.connect(); // ensure socket connects for public users (no-op if auth already called reconnect())

    // Show notification on server error (5xx)
=======
    // Show notification on server error (5xx), debounced to avoid flooding
    let serverErrorTimeout: ReturnType<typeof setTimeout> | null = null;
>>>>>>> 8a3b61c9 (Refactor and improve exception handling for api and clients, also add unit tests to ensure long term stability)
    watch(serverError, (error) => {
        if (error) {
            serverError.value = null;
            if (serverErrorTimeout) return;
            Sentry.captureMessage(`Server error: ${error}`, "error");
            useNotificationStore().addNotification({
                title: "Server error",
                description: error,
                state: "error",
                timer: 10000,
            });

            // Debounce server error notifications to avoid flooding the user with alerts if multiple errors occur in a short time
            serverErrorTimeout = setTimeout(() => {
                serverErrorTimeout = null;
            }, 5000);
        }
    });

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
