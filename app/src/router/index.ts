import HomePage from "@/pages/HomePage.vue";
import { ref } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import OpenAppWarningPage from "@/pages/OpenAppWarningPage.vue";
import { isTelegramBrowser } from "@/util/inAppBrowser";

// Preload all route components immediately as separate chunks
const ExplorePage = import("@/pages/ExplorePage.vue");
const VideoPage = import("@/pages/VideoPage.vue");
const SettingsPage = import("@/pages/SettingsPage.vue");
const BookmarksPage = import("@/pages/BookmarksPage.vue");
const SingleContent = import("@/pages/SingleContent/SingleContent.vue");
const NotFoundPage = import("@/pages/NotFoundPage.vue");

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
    routes: [
        {
            path: "/open",
            component: OpenAppWarningPage,
            name: "open-warning",
            meta: {
                analyticsIgnore: true,
            },
        },
        {
            path: "/",
            component: HomePage,
            name: "home",
            meta: {
                title: "title.home",
                analyticsIgnore: true,
            },
        },
        {
            path: "/explore",
            component: () => ExplorePage,
            name: "explore",
            meta: {
                title: "title.explore",
            },
        },
        {
            path: "/watch",
            component: () => VideoPage,
            name: "watch",
            meta: {
                title: "title.watch",
            },
        },
        {
            path: "/settings",
            component: () => SettingsPage,
            name: "settings",
            meta: {
                title: "title.settings",
                analyticsIgnore: true,
            },
        },

        {
            path: "/bookmarks",
            component: () => BookmarksPage,
            name: "bookmarks",
            meta: {
                title: "title.bookmarks",
            },
        },

        // Note that this route should always come after all defined routes,
        // to prevent wrongly configured slugs from taking over pages
        {
            path: "/:slug",
            component: () => SingleContent,
            name: "content",
            props: true,
        },

        {
            path: "/:pathMatch(.*)*",
            name: "404",
            component: () => NotFoundPage,
            meta: {
                analyticsIgnore: true,
            },
        },
    ],
});

const routeHistory = ref<string[]>([]);

router.beforeEach((to) => {
    const telegramWarningAcknowledged =
        sessionStorage.getItem("telegram_open_warning_ack") === "1";

    // Only show the interstitial on the first load inside Telegram's in-app browser.
    if (
        !telegramWarningAcknowledged &&
        isTelegramBrowser() &&
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
