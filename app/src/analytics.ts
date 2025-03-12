import { app } from "./main";
import router from "./router";
// @ts-expect-error Matomo does not have a typescript definition file
import VueMatomo from "vue-matomo";

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

    // register Matomo service worker
    if (import.meta.env.VITE_ANALYTICS_HOST && import.meta.env.VITE_ANALYTICS_SITEID) {
        if ("serviceWorker" in navigator) {
            window.addEventListener("load", () => {
                navigator.serviceWorker.register(
                    `src/analytics/service-worker.js?matomo_server=${import.meta.env.VITE_ANALYTICS_HOST}`,
                );
            });
        }
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
