import { app } from "./main";
import router from "./router";
// @ts-expect-error Matomo does not have a typescript definition file
import VueMatomo from "vue-matomo";

declare global {
    interface Window {
        __VITE_ALLOWED_MATOMO_SERVERS: string;
    }
}

/**
 * Initialize Matomo analytics
 */
export const initAnalytics = () => {
    // Matomo Analytics
    if (import.meta.env.VITE_ANALYTICS_HOST && import.meta.env.VITE_ANALYTICS_SITEID)
        app.use(VueMatomo, {
            host: import.meta.env.VITE_ANALYTICS_HOST,
            siteId: import.meta.env.VITE_ANALYTICS_SITEID,
            router: router,
        });

    // Start analytics on initial load
    router.afterEach((to) => {
        const fullPath = to.fullPath;
        const title =
            (to.meta.title as string) || (to.params.slug as string) || (to.path as string);
        if (
            // @ts-expect-error window is a native browser api, and matomo is attaching _paq to window
            window._paq &&
            !fullPath.match(/(\/settings|\/explore)\/index\/login\/\?code/i) &&
            !title.match(/^Home$|Loading...|Page not found/i)
        )
            // @ts-expect-error window is a native browser api, and matomo is attaching _paq to window
            window._paq.push(
                ["setCustomUrl", window.location.origin + fullPath],
                ["setDocumentTitle", title],
                ["trackPageView"],
                ["trackVisibleContentImpressions"],
            );
    });

    // before registering the service worker, inject the whitelist into window so the SW can read it.
    // This avoids referencing import.meta inside the SW source (prevents parse errors in non-module eval).
    if (typeof window !== "undefined") {
        // ensure the string is JSON (Vite supplies this)
        window.__VITE_ALLOWED_MATOMO_SERVERS = import.meta.env.VITE_ALLOWED_MATOMO_SERVERS || "[]";
    }

    // register sw (dev: src path, prod: use root asset). ensure module type so SW can be module if needed.
    const MATOMO = import.meta.env.VITE_MATOMO_SERVER;
    if (MATOMO && "serviceWorker" in navigator) {
        const swPath = import.meta.env.PROD
            ? "/analytics/service-worker.js"
            : "/src/analytics/service-worker.js";
        const swUrl = `${swPath}?matomo_server=${encodeURIComponent(MATOMO)}`;
        const scope = import.meta.env.PROD
            ? "/"
            : new URL(swUrl, location.href).pathname.replace(/\/[^/]+$/, "/");
        navigator.serviceWorker
            .register(swUrl, { scope, type: "module" })
            .catch((err) => console.error("Matomo SW registration failed:", err));
    } else {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.getRegistrations().then((registrations) => {
                for (const registration of registrations) {
                    registration.unregister();
                }
            });
        }
    }
};
