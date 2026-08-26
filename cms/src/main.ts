import "./assets/main.css";
import { createApp, watch } from "vue";
import { createPinia } from "pinia";
import * as Sentry from "@sentry/vue";
import App from "./App.vue";
import router from "./router";
import {
    changeReqErrors,
    changeReqInfo,
    changeReqWarnings,
    getSocket,
    init,
    serverError,
} from "luminary-shared";
import { apiUrl, contentSyncWindowMs, initLanguage } from "@/globalConfig";
import auth, { readPersistedProvider } from "./auth";
import { registerAuthFailureHandler } from "./authFailure";
import { useNotificationStore } from "./stores/notification";
import { initAuthLangSync, initSync } from "./sync";
import { CMS_DOCS_INDEX } from "./docsIndex";

const app = createApp(App);

// Install Pinia early so any watchers/effects registered during startup that
// resolve a store (e.g. useNotificationStore) have an active Pinia instance.
app.use(createPinia());

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
        // Keep the local content corpus bounded; older content is fetched on demand.
        contentPublishDateCutoff: Date.now() - contentSyncWindowMs,
    }).catch((err) => {
        console.error(err);
        Sentry.captureException(err);
    });

    const socket = getSocket();

    registerAuthFailureHandler();

    // Start the auth-provider/language sync watcher before setupAuth(), which may
    // connect the socket (directly, or indirectly via the auth-failure handler
    // above forcing an anonymous reconnect): if the watcher isn't listening yet,
    // the isConnected/accessMap transition that should kick off the AuthProvider
    // sync is missed until some later, unrelated change re-triggers it.
    initAuthLangSync();

    await auth.setupAuth();
    // Ensure the socket connects for visitors with no session (no-op if auth
    // already called reconnect()). Skip when a persisted provider session
    // exists but auth didn't complete (e.g. transient silent-refresh failure):
    // an anonymous handshake would replace the persisted accessMap with the
    // default-groups map and deleteRevoked would purge local data. The pending
    // re-login/refresh connects the socket instead.
    if (!(readPersistedProvider() && !auth.activeProviderId.value)) socket.connect();

    // Show notification on server error (5xx), debounced to avoid flooding.
    // CMS has no i18n layer; copy is owned here rather than in the shared lib.
    let serverErrorTimeout: ReturnType<typeof setTimeout> | null = null;
    watch(serverError, (error) => {
        if (error) {
            serverError.value = null;
            console.error(`Server error: ${error.status}${error.message ? ` ${error.message}` : ""}`);
            if (serverErrorTimeout) return;
            Sentry.captureMessage(
                `Server error: ${error.status}${error.message ? ` ${error.message}` : ""}`,
                "error",
            );
            useNotificationStore().addNotification({
                title: "Server error",
                description: "Something went wrong on the server. Please try again in a minute.",
                state: "error",
                timer: 10000,
            });

            // Debounce server error notifications to avoid flooding the user with alerts if multiple errors occur in a short time
            serverErrorTimeout = setTimeout(() => {
                serverErrorTimeout = null;
            }, 5000);
        }
    });

    // Show notification if a change request was rejected or accepted with server messages
    watch([changeReqWarnings, changeReqErrors, changeReqInfo], ([warnings, errors, info]) => {
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

        if (info.length > 0) {
            useNotificationStore().addNotification({
                title: "Info",
                description: info.join("\n"),
                state: "info",
                timer: 60000,
            });
            changeReqInfo.value = [];
        }
    });

    await initLanguage();
    initSync();

    app.use(router);
    app.mount("#app");
}

Startup();
