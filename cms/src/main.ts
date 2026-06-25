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

// Install Pinia early so any watchers/effects registered during startup that
// resolve a store (e.g. useNotificationStore) have an active Pinia instance.
app.use(createPinia());

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
        // CMS editors need the full content set — omit any publishDate cutoff so
        // sync keeps its OPEN_MIN default (full content sync) and HybridQuery's
        // older-tail supplement never fires.
        contentPublishDateCutoff: undefined,
        // What gets synced (and may be persisted to IndexedDB) is owned by sync
        // (see src/sync.ts); sync joins the socket rooms for those types. This list
        // is now ONLY the transitional live-only types — docs we display live but
        // never sync. Their rooms are joined at the connect handshake so live socket
        // updates arrive. Remove once the CMS migrates these to HybridQuery (which
        // subscribes to rooms on demand).
        syncList: [
            { type: DocType.User },
            { type: DocType.AutoGroupMappings },
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
                // Bypass the SDK's token cache: the server already rejected
                // what we had, so the cached copy is useless and we must hit
                // /oauth/token.
                if (await auth.refreshTokenSilently({ ignoreCache: true })) return;

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

    await auth.setupAuth(app);
    socket.connect(); // ensure socket connects for public users (no-op if auth already called reconnect())

    // Show notification on server error (5xx), debounced to avoid flooding.
    // CMS has no i18n layer; copy is owned here rather than in the shared lib.
    let serverErrorTimeout: ReturnType<typeof setTimeout> | null = null;
    watch(serverError, (error) => {
        if (error) {
            serverError.value = null;
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

    app.use(router);
    app.mount("#app");
}

Startup();
