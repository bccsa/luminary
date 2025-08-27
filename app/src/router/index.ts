import HomePage from "@/pages/HomePage.vue";
import { createRouter, createWebHistory } from "vue-router";

// Preload components as separate chunks
const preloadedComponents = {
    ExplorePage: () => import("@/pages/ExplorePage.vue"),
    VideoPage: () => import("@/pages/VideoPage.vue"),
    SettingsPage: () => import("@/pages/SettingsPage.vue"),
    BookmarksPage: () => import("@/pages/BookmarksPage.vue"),
    SingleContent: () => import("@/pages/SingleContent.vue"),
    NotFoundPage: () => import("@/pages/NotFoundPage.vue"),
};

// Start preloading all components immediately
Object.values(preloadedComponents).forEach((loader) => {
    loader();
});

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
            component: preloadedComponents.ExplorePage,
            name: "explore",
            meta: {
                title: "title.explore",
            },
        },
        {
            path: "/watch",
            component: preloadedComponents.VideoPage,
            name: "watch",
            meta: {
                title: "title.watch",
            },
        },
        {
            path: "/settings",
            component: preloadedComponents.SettingsPage,
            name: "settings",
            meta: {
                title: "title.settings",
                analyticsIgnore: true,
            },
        },

        {
            path: "/bookmarks",
            component: preloadedComponents.BookmarksPage,
            name: "bookmarks",
            meta: {
                title: "title.bookmarks",
            },
        },

        // Note that this route should always come after all defined routes,
        // to prevent wrongly configured slugs from taking over pages
        {
            path: "/:slug",
            component: preloadedComponents.SingleContent,
            name: "content",
            props: true,
        },

        {
            path: "/:pathMatch(.*)*",
            name: "404",
            component: preloadedComponents.NotFoundPage,
            meta: {
                analyticsIgnore: true,
            },
        },
    ],
});

export default router;
