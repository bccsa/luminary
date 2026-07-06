import "./assets/main.css";
import { createApp, watch } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import {
    setupAuth,
    openProviderModal,
    clearAuth0Cache,
    resolveActiveProvider,
    loginWithProvider,
    refreshTokenSilently,
} from "@/auth";
import { useNotificationStore } from "./stores/notification";
import { appPluginsManager } from "@/build-time/contracts/plugin-registry";
import { getSocket, init, warmMangoCaches, serverError, isConnected } from "luminary-shared";
import {
    appSyncedLanguageIdsAsRef,
    initLanguage,
    isAppLoading,
    isInstalledStandalone,
} from "./globalConfig";
import { apiUrl } from "./globalConfig";
import { initAppTitle, initI18n } from "./i18n";
import { initAnalytics } from "./analytics";
import { initSync, initAuthLangSync } from "./sync";
import { APP_DOCS_INDEX } from "./docsIndex";
import { initSentry, Sentry } from "@/util/initSentry";
import { markAppReady, markAppError } from "@/util/renderState";

export const app = createApp(App);

// Install Pinia early so any watchers/effects registered during startup that
// resolve a store (e.g. useNotificationStore) have an active Pinia instance.
app.use(createPinia());

initSentry(app);

/**
 * Content sync window. Installed (standalone) sessions sync the full corpus (no
 * cutoff). Browser-tab sessions sync only the last ~1 month; content with
 * `publishDate` older than `Date.now() - BROWSER_CONTENT_SYNC_WINDOW_MS` is not
 * synced into IndexedDB and is fetched on demand by `HybridQuery`. The tier is
 * decided once per launch — installing takes effect on the next app open.
 */
const BROWSER_CONTENT_SYNC_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // ~1 month

async function Startup() {
    // Pre-warm Mango query caches from localStorage before any queries run.
    // On the first visit this is a no-op; on subsequent loads it eliminates
    // cold-start compilation latency for IndexedDB queries.
    warmMangoCaches();

    // Installed (standalone) users sync the full corpus; browser-tab users get a
    // rolling ~1 month window (older content is fetched on demand by HybridQuery).
    const installedStandalone = isInstalledStandalone();

    await init({
        cms: false,
        docsIndex: APP_DOCS_INDEX,
        apiUrl,
        // The shared "active languages" (keep gate + fallback `$nin`) are the SYNCED subset, not
        // the full preferred display order — so only chosen languages download, while preferred-
        // but-unsynced languages are fetched on demand.
        appLanguageIdsAsRef: appSyncedLanguageIdsAsRef,
        contentPublishDateCutoff: installedStandalone
            ? undefined // no cutoff → full corpus
            : Date.now() - BROWSER_CONTENT_SYNC_WINDOW_MS,
    }).catch((err) => {
        console.error(err);
        Sentry?.captureException(err);
    });

    const socket = getSocket();

    // Guards the visibilitychange-triggered reconnect below against firing again
    // while a previous attempt is still in flight (e.g. rapid tab switching, or a
    // slow Auth0 round-trip during startup) — otherwise each flip restarts the
    // handshake and the connection state visibly flaps.
    let reconnecting = false;

    // Register the apiAuthFailed listener BEFORE setupAuth(), because setupAuth()
    // may connect the socket with an expired token — if the listener isn't ready
    // by then, the event is lost and the client loops forever.
    socket.on(
        "connect_error",
        async (err: Error & { data?: { type?: string; reason?: string } }) => {
            if (err.data?.type !== "auth_failed" && err.message !== "auth_failed") return;
            reconnecting = false;

            const reason = err.data?.reason;

            // Provider was deleted / never existed: don't re-attempt login with
            // the cached provider (it'll loop). Force the user through provider
            // selection instead.
            if (reason === "provider_not_found") {
                clearAuth0Cache();
                socket.setAuth("", null);
                openProviderModal();
                return;
            }

            // Normal case: the access token expired. Ask the Auth0 SDK for a
            // fresh one via the refresh token — no redirect needed. Bypass
            // the SDK's token cache: the server already rejected what we had,
            // so the cached copy is useless and we must hit /oauth/token.
            if (await refreshTokenSilently({ ignoreCache: true })) return;

            // The refresh token itself is gone or rejected — need a visible
            // re-login.
            Sentry?.captureMessage("API authentication failed; silent refresh failed");
            const lastProvider = await resolveActiveProvider();
            clearAuth0Cache();
            socket.setAuth("", null);
            if (lastProvider) {
                await loginWithProvider(lastProvider, { prompt: "login" });
            } else {
                openProviderModal();
            }
        },
    );

    await setupAuth(app, router);
    socket.connect(); // ensure socket connects for public users (no-op if auth already called reconnect())

    // A tab backgrounded during sleep/long idle can end up with the socket
    // disconnected and auto-reconnect turned off (see socketio.ts's auth_failed
    // handling) with no future retry scheduled. Foregrounding the tab is the
    // natural moment to try again — any resulting auth failure is handled by
    // the connect_error listener above, same as any other reconnect. Registered
    // after setupAuth() so it can't race the initial (possibly slow, Auth0-backed)
    // connection attempt; `reconnecting` stops repeat visibility flips from
    // restarting an attempt that's already in flight.
    watch(isConnected, (connected) => {
        if (connected) reconnecting = false;
    });
    socket.on("disconnect", () => {
        reconnecting = false;
    });
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && !isConnected.value && !reconnecting) {
            reconnecting = true;
            socket.reconnect();
        }
    });

    // Install all plugins before mounting — components rendered during the
    // splash screen (e.g. SearchModal) call useI18n() at setup time.
    const i18n = initI18n();

    // Show notification on server error (5xx), debounced to avoid flooding.
    // Translation is owned by the client, not the shared lib.
    let serverErrorTimeout: ReturnType<typeof setTimeout> | null = null;
    watch(serverError, (error) => {
        if (error) {
            serverError.value = null;
            if (serverErrorTimeout) return;
            Sentry?.captureMessage(
                `Server error: ${error.status}${error.message ? ` ${error.message}` : ""}`,
                "error",
            );
            const { t } = i18n.global;
            useNotificationStore().addNotification({
                title: t("notification.server_error.title"),
                description: t("notification.server_error.description"),
                state: "error",
                type: "toast",
                timeout: 10000,
            });
            // Debounce server error notifications to avoid flooding if multiple requests fail in quick succession
            serverErrorTimeout = setTimeout(() => {
                serverErrorTimeout = null;
            }, 5000);
        }
    });

    app.use(router);
    app.use(i18n);
    app.use(appPluginsManager);
    app.mount("#app");

    initAuthLangSync();
    await initLanguage();
    initSync();

    isAppLoading.value = false;
    initAppTitle(i18n);
    initAnalytics();
    markAppReady();
}

Startup().catch((err) => {
    console.error(err);
    Sentry?.captureException(err);
    markAppError();
});
