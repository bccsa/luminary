import "./assets/main.css";
import { createApp, watch } from "vue";
import { createPinia } from "pinia";
import * as Sentry from "@sentry/vue";
import App from "./App.vue";
import AuthPendingPage from "./pages/AuthPendingPage.vue";
import router from "./router";
import { db, DocType, init, updateAuthToken } from "luminary-shared";
import { apiUrl, initLanguage } from "@/globalConfig";
import auth, { isAuthBypassed } from "./auth";
import { useNotificationStore } from "./stores/notification";
import { changeReqWarnings, changeReqErrors } from "luminary-shared";
import { initLanguageSync, initSync } from "./sync";

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

/**
 * Poll IndexedDB until at least one OAuthProvider doc appears, or timeout.
 * Required before setupAuth() so getProviderConfig() can resolve from DB (and sessionStorage provider id after redirect).
 */
async function waitForProviders(timeoutMs = 5000): Promise<void> {
    if (!db) return;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const count = await db.docs
            .where("type")
            .equals(DocType.OAuthProvider)
            .count();
        if (count > 0) return;
        await new Promise((r) => setTimeout(r, 250));
    }
}

async function Startup() {
    app.use(createPinia());

    // Run init() before setupAuth() so getProviderConfig() can read OAuthProvider from DB.
    // After Auth0 redirect we have sessionStorage provider id; DB must be ready to resolve config.
    await init({
        cms: true,
        docsIndex:
            "type, parentId, updatedTimeUtc, language, [type+tagType], [type+docType], [type+language], slug, title, [type+parentType+language], [type+parentTagType]",
        apiUrl,
        syncList: [
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
            {
                type: DocType.OAuthProvider,
                syncPriority: 1,
                skipWaitForLanguageSync: true,
            },
        ],
    }).catch((err) => {
        console.error(err);
        Sentry.captureException(err);
    });

    await waitForProviders();

    // Install Auth0 before router so useAuth0() is available when router runs (like app)
    const oauth = await auth.installAuth(app);
    if (!oauth) {
        createApp(AuthPendingPage).use(createPinia()).mount("#app");
        return;
    }
    app.use(router);
    await auth.finishAuth(app, router, oauth);

    // Mount first so the loading state (logo + loading bar) is visible before getToken may open the login modal
    app.mount("#app");

    // Acquire the auth token BEFORE starting sync so the socket connects with the
    // real JWT. Without this, the socket's first connection is unauthenticated and
    // the API assigns public-only permissions, overriding the user's actual groups.
    const token = isAuthBypassed
        ? "mock-token-for-e2e-testing"
        : await auth.getToken(oauth);

    if (token) {
        updateAuthToken(token);
    }

    initLanguageSync();
    await initLanguage();
    initSync();

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
}

Startup();
