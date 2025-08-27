import HomePage from "@/pages/HomePage.vue";
import { createRouter, createWebHistory } from "vue-router";

// Preload all route components immediately as separate chunks
const ExplorePage = import("@/pages/ExplorePage.vue");
const VideoPage = import("@/pages/VideoPage.vue");
const SettingsPage = import("@/pages/SettingsPage.vue");
const BookmarksPage = import("@/pages/BookmarksPage.vue");
const SingleContent = import("@/pages/SingleContent.vue");
const NotFoundPage = import("@/pages/NotFoundPage.vue");

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

export default router;
