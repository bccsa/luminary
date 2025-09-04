import "./assets/main.css";
import { createApp, watch } from "vue";
import { createPinia } from "pinia";
import * as Sentry from "@sentry/vue";
import App from "./App.vue";
import router from "./router";
import { DocType, getSocket, init } from "luminary-shared";
import { apiUrl, initLanguage } from "@/globalConfig";
import auth from "./auth";
import { useNotificationStore } from "./stores/notification";
import { changeReqWarnings, changeReqErrors } from "luminary-shared";

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
    const oauth = await auth.setupAuth(app, router);
    const token = await auth.getToken(oauth);

    await init({
        cms: true,
        docsIndex:
            "type, parentId, updatedTimeUtc, language, [type+tagType], [type+docType], [type+language], slug, title, [type+parentType+language], [type+parentTagType]",
        apiUrl,
        token,
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
        ],
    }).catch((err) => {
        console.error(err);
        Sentry.captureException(err);
    });

    const socket = getSocket();

    // Redirect to login if the API authentication fails
    socket.on("apiAuthFailed", async () => {
        console.error("API authentication failed, redirecting to login");
        Sentry.captureMessage("API authentication failed, redirecting to login");
        await auth.loginRedirect(oauth);
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

    await initLanguage();

    app.use(createPinia());
    app.use(router);
    app.mount("#app");
}

Startup();

// Version / update check (after app boot so notification store exists)
const VERSION_STORAGE_KEY = "app_version";
let updateNotified = false;
async function checkForUpdate(showIfSame = false) {
    try {
        const res = await fetch(`/version.json`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { hash?: string };
        if (!data?.hash) return;
        const current = localStorage.getItem(VERSION_STORAGE_KEY);
        if (current && current !== data.hash && !updateNotified) {
            updateNotified = true;
            useNotificationStore().addNotification({
                title: "Update available",
                description:
                    "Good news! A new version of the CMS is ready. Click here to reload and apply the update.",
                state: "warning",
                timer: 60000,
                click: () => {
                    // Persist new version and reload
                    localStorage.setItem(VERSION_STORAGE_KEY, data.hash!);
                    location.reload();
                },
            });
        } else if (showIfSame && !current) {
            // first load, store silently
        }
        localStorage.setItem(VERSION_STORAGE_KEY, data.hash);
    } catch (e) {
        // ignore
    }
}

// Initial delayed check & interval
setTimeout(() => checkForUpdate(), 4000);
// Re-check every 5 minutes (configurable via env later if needed)
setInterval(() => checkForUpdate(), 5 * 60 * 1000);

// Optional: expose manual trigger (for debugging in console)
// @ts-ignore
window.__checkUpdate = checkForUpdate;
