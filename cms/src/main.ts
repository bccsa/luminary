import "./assets/main.css";
import { createApp, watch } from "vue";
import { createPinia } from "pinia";
import * as Sentry from "@sentry/vue";
import App from "./App.vue";
import router from "./router";
import {
    changeReqErrors,
    changeReqWarnings,
    getSocket,
    init,
    serverError,
} from "luminary-shared";
import { apiUrl, contentSyncWindowMs, initLanguage } from "@/globalConfig";
import auth, { isAuthBypassed, readPersistedProvider } from "./auth";
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
                    auth.clearAuthCache();
                    socket.setAuth("", null);
                    auth.openProviderModal();
                    return;
                }

                // Normal case: the access token expired. Ask the OIDC client for
                // a fresh one via the refresh token — no redirect needed.
                // Bypass the client's token cache: the server already rejected
                // what we had, so the cached copy is useless and we must hit
                // the token endpoint.
                if (await auth.refreshTokenSilently({ ignoreCache: true })) return;

                // The refresh token itself is gone or rejected — need a
                // visible re-login.
                Sentry.captureMessage("API authentication failed; silent refresh failed");
                const lastProvider = await auth.resolveActiveProvider();
                auth.clearAuthCache();
                socket.setAuth("", null);
                if (lastProvider) {
                    await auth.loginWithProvider(lastProvider, { prompt: "login" });
                } else {
                    auth.openProviderModal();
                }
            },
        );
    }

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
