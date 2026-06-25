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
import { getSocket, init, warmMangoCaches, serverError } from "luminary-shared";
import {
    appLanguageIdsAsRef,
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

if (import.meta.env.VITE_FAV_ICON) {
    const favicon = document.getElementById("favicon") as HTMLLinkElement;
    if (favicon) {
        favicon.href = import.meta.env.VITE_LOGO_FAVICON;
    }
}

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
        appLanguageIdsAsRef,
        contentPublishDateCutoff: installedStandalone
            ? undefined // no cutoff → full corpus
            : Date.now() - BROWSER_CONTENT_SYNC_WINDOW_MS,
        // What gets synced is owned by sync (see src/sync.ts); the socket rooms for
        // those types are joined dynamically by sync. The app has no live-only
        // types (SingleContent reads synced content / language, whose rooms sync
        // already joins), so this stays empty.
        syncList: [],
    }).catch((err) => {
        console.error(err);
        Sentry?.captureException(err);
    });

    const socket = getSocket();

    // Register the apiAuthFailed listener BEFORE setupAuth(), because setupAuth()
    // may connect the socket with an expired token — if the listener isn't ready
    // by then, the event is lost and the client loops forever.
    socket.on(
        "connect_error",
        async (err: Error & { data?: { type?: string; reason?: string } }) => {
            if (err.data?.type !== "auth_failed" && err.message !== "auth_failed") return;

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
