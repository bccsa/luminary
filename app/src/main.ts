import "./assets/main.css";
import { createApp } from "vue";
import { createPinia } from "pinia";
import * as Sentry from "@sentry/vue";
import App from "./App.vue";
import router from "./router";
import auth from "./auth";
import { db, DocType, getSocket, initLuminaryShared, type BaseDocumentDto } from "luminary-shared";
import { loadPlugins } from "./util/pluginLoader";
import { appLanguageIdsAsRef, initLanguage } from "./globalConfig";
import { apiUrl } from "./globalConfig";
import { initI18n } from "./i18n";
import { initAnalytics } from "./analytics";
import { createI18n } from "vue-i18n";

window.onbeforeunload = () => {
    db.close();
};

export const app = createApp(App);

if (import.meta.env.VITE_FAV_ICON) {
    const favicon = document.getElementById("favicon") as HTMLLinkElement;
    if (favicon) {
        favicon.href = import.meta.env.VITE_LOGO_FAVICON;
    }
}
console.log("window.indexeddb", window.indexedDB);

if (import.meta.env.PROD) {
    Sentry.init({
        app,
        dsn: import.meta.env.VITE_SENTRY_DSN,
        integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
    });
}

function getDocumentsByType(): Promise<any[]> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("luminary-db");

        request.onerror = () => reject("Failed to open IndexedDB");

        request.onsuccess = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            console.log(Date.now().toString(), "Database version:", db.version);
            const transaction = db.transaction("docs", "readonly");
            console.log(Date.now().toString(), "Transaction created");
            const store = transaction.objectStore("docs");
            console.log(Date.now().toString(), "Store created");
            const index = store.index("type");
            console.log(Date.now().toString(), "Index created");
            const request1 = index.getAll("language");
            console.log(Date.now().toString(), "Request created");

            request1.onsuccess = () => resolve(request1.result);
            request1.onerror = () => reject("Failed to retrieve documents");
        };
    });
}

const timeout = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function Startup() {
    // await timeout(1000);
    console.log(Date.now().toString(), "Startup");
    const oauth = await auth.setupAuth(app, router);
    console.log(Date.now().toString(), "Auth setup complete");
    const token = await auth.getToken(oauth);
    console.log(Date.now().toString(), "Token received");

    await initLuminaryShared({
        cms: false,
        docsIndex:
            "type, parentId, slug, language, docType, redirect, publishDate, expiryDate, [type+parentTagType+status], [type+parentPinned], [type+status], [type+docType]",
        apiUrl,
        token,
        appLanguageIdsAsRef,
        docTypes: [
            { type: DocType.Tag, contentOnly: true, syncPriority: 2 },
            { type: DocType.Post, contentOnly: true, syncPriority: 2 },
            {
                type: DocType.Language,
                contentOnly: false,
                syncPriority: 1,
                skipWaitForLanguageSync: true,
            },
        ],
    }).catch((err) => {
        console.error(err);
        Sentry.captureException(err);
    });
    console.log(Date.now().toString(), "Luminary shared setup complete");

    // await db.docs.put({
    //     _id: "test",
    //     type: DocType.Language,
    //     language: "xx",
    // } as BaseDocumentDto);
    // console.log(Date.now().toString(), "Test document added");

    // const ldocs = await db.docs.where("type").equals(DocType.Language).toArray();
    // console.log("language docs", ldocs);

    // const test = await getDocumentsByType().catch((err) => console.error(err));
    // console.log(Date.now().toString(), "test", test);

    // Redirect to login if the API authentication fails
    getSocket().on("apiAuthFailed", async () => {
        console.error("API authentication failed, redirecting to login");
        Sentry.captureMessage("API authentication failed, redirecting to login");
        db.close();
        await auth.loginRedirect(oauth);
    });
    console.log(Date.now().toString(), "Socket setup complete");

    await initLanguage();
    console.log(Date.now().toString(), "Language setup complete");
    const i18n = await initI18n();
    console.log(Date.now().toString(), "i18n setup complete");
    await loadPlugins();

    app.use(createPinia());
    app.use(router);
    // const i18n = createI18n({ legacy: false });
    app.use(i18n);
    app.mount("#app");
    initAnalytics();
}

Startup();
