import "./assets/main.css";
import { createApp, watch } from "vue";
import { createPinia } from "pinia";
import * as Sentry from "@sentry/vue";
import App from "./App.vue";
import router from "./router";
import {
    DocType,
    getSocket,
    init,
    db,
    isConnected,
    accessMap,
    type AccessMap,
    type GroupDto,
} from "luminary-shared";
import { apiUrl, initLanguage } from "@/globalConfig";
import auth, { isAuthBypassed } from "./auth";
import { useNotificationStore } from "./stores/notification";
import { changeReqWarnings, changeReqErrors } from "luminary-shared";
import { initLanguageSync, initSync } from "./sync";
import { E2E_ACCESS_MAP } from "./e2e/accessMap";

type E2eHelpers = {
    setConnected: (v: boolean) => void;
    setAccessMap: (map: AccessMap) => void;
    seedGroup: (group: GroupDto) => Promise<void>;
    getLocalChanges: () => Promise<Array<{ doc?: { type?: string }; docId?: string }>>;
};

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
    const token = isAuthBypassed ? "mock-token-for-e2e-testing" : await auth.getToken(oauth);

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

    // E2E-only: give mock user full super-admin access and expose hooks for sync/seed
    if (isAuthBypassed && typeof window !== "undefined") {
        accessMap.value = E2E_ACCESS_MAP;
        (window as unknown as { __e2e?: E2eHelpers }).__e2e = {
            setConnected: (v: boolean) => {
                isConnected.value = v;
            },
            setAccessMap: (map: AccessMap) => {
                accessMap.value = map;
            },
            seedGroup: async (group: GroupDto) => {
                await db.docs.put(group);
            },
            getLocalChanges: () =>
                db.localChanges.toArray() as unknown as Promise<
                    Array<{ doc?: { type?: string }; docId?: string }>
                >,
        };
    }

    const socket = getSocket();

    // Redirect to login if the API authentication fails (skip in auth bypass mode)
    if (!isAuthBypassed) {
        socket.on("apiAuthFailed", async () => {
            console.error("API authentication failed, redirecting to login");
            Sentry.captureMessage("API authentication failed, redirecting to login");
            await auth.loginRedirect(oauth);
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

    initLanguageSync();
    await initLanguage();
    initSync();

    app.use(createPinia());
    app.use(router);
    app.mount("#app");
}

Startup();
