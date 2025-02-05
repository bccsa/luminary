import "./assets/main.css";
import { createApp } from "vue";
import { createPinia } from "pinia";
import * as Sentry from "@sentry/vue";
import App from "./App.vue";
import router from "./router";
import { DocType, getSocket, initLuminaryShared } from "luminary-shared";
import { apiUrl } from "@/globalConfig";
import auth from "./auth";
import { useNotificationStore } from "./stores/notification";

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

    await initLuminaryShared({
        cms: true,
        docsIndex:
            "type, parentId, updatedTimeUtc, language, [type+tagType], [type+docType], [type+language]",
        apiUrl,
        token,
        docTypes: [
            { type: DocType.Tag, contentOnly: false, syncPriority: 2 },
            { type: DocType.Post, contentOnly: false, syncPriority: 2 },
            { type: DocType.Redirect, contentOnly: false, syncPriority: 2 },
            { type: DocType.Language, contentOnly: false, syncPriority: 1 },
            { type: DocType.Group, contentOnly: false, syncPriority: 1 },
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

    // Show notification if a change request was rejected
    socket.on("changeRequestAck", (data: any) => {
        if (data.ack == "rejected") {
            useNotificationStore().addNotification({
                title: "Saving changes to server failed.",
                description: `Your recent request to save changes has failed. The changes have been reverted. Error message: ${data.message}`,
                state: "error",
                timer: 60000,
            });
        }
    });

    app.use(createPinia());
    app.use(router);
    app.mount("#app");
}

Startup();
