import { ref } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { isInAppBrowser } from "@/util/inAppBrowser";
import { markPageLoading } from "@/util/renderState";
import { markHistoryNavigation } from "@/composables/useScrollMemory";
import { routes } from "./routes";

// Track if navigation is from within the app
let isInternalNavigation = false;

export const markInternalNavigation = () => {
    isInternalNavigation = true;
};

export const isExternalNavigation = () => {
    return !isInternalNavigation;
};

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    // Pages scroll inside their own <main> (BasePage), not the window; useScrollMemory handles it.
    scrollBehavior: () => false,
    routes,
});

// Registered before the router's own popstate listener, so the flag is set when its guards run.
let pendingPop = false;
router.options.history.listen((_to, _from, info) => {
    pendingPop = info.type === "pop";
});

const routeHistory = ref<string[]>([]);

router.beforeEach((to) => {
    markPageLoading();
    markHistoryNavigation(pendingPop);
    pendingPop = false;

    const inAppWarningAcknowledged =
        sessionStorage.getItem("inapp_open_warning_ack") === "1";

    // Only show the interstitial on the first load inside an in-app browser.
    if (
        !inAppWarningAcknowledged &&
        isInAppBrowser() &&
        isExternalNavigation() &&
        to.name !== "open-warning"
    ) {
        return {
            name: "open-warning",
            query: { to: to.fullPath },
            replace: true,
        };
    }
    // Handle history navigation
    routeHistory.value.push(to.fullPath);
});

export function getRouteHistory() {
    return routeHistory;
}

export default router;
