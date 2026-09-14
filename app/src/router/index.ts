import { ref } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { isInAppBrowser } from "@/util/inAppBrowser";
import { markPageLoading } from "@/util/renderState";
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
    scrollBehavior(to, from, savedPosition) {
        if (savedPosition) {
            return savedPosition;
        } else {
            return { top: 0 };
        }
    },
    routes,
});

const routeHistory = ref<string[]>([]);

router.beforeEach((to) => {
    markPageLoading();

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
