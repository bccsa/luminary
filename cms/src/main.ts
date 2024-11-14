import "./assets/main.css";

import { createApp } from "vue";
import { createPinia } from "pinia";

import { createAuth0 } from "@auth0/auth0-vue";
import * as Sentry from "@sentry/vue";

import App from "./App.vue";
import router from "./router";
import { initLuminaryShared } from "luminary-shared";

const app = createApp(App);

if (import.meta.env.PROD) {
    Sentry.init({
        app,
        dsn: import.meta.env.VITE_SENTRY_DSN,
        integrations: [],
    });
}

// Startup
async function Startup() {
    const docsIndex: string =
        "type, parentId, updatedTimeUtc, language, [type+tagType], [type+docType], [type+language]";
    initLuminaryShared({ cms: true }, docsIndex);

    app.use(createPinia());

    app.use(router);

    app.use(
        createAuth0({
            domain: import.meta.env.VITE_AUTH0_DOMAIN,
            clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
            authorizationParams: {
                audience: import.meta.env.VITE_AUTH0_AUDIENCE,
                redirect_uri: window.location.origin,
                scope: "openid profile email offline_access",
            },
            cacheLocation: "localstorage",
            useRefreshTokens: true,
        }),
    );
    app.mount("#app");
}

Startup();
