import { createRouter, createWebHistory } from "vue-router";

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
            component: () => import("@/pages/HomePage.vue"),
            name: "home",
            meta: {
                title: "title.home",
                analyticsIgnore: true,
            },
        },
        {
            path: "/explore",
            component: () => import("@/pages/ExplorePage.vue"),
            name: "explore",
            meta: {
                title: "title.explore",
            },
        },
        {
            path: "/watch",
            component: () => import("@/pages/VideoPage.vue"),
            name: "watch",
            meta: {
                title: "title.watch",
            },
        },
        {
            path: "/settings",
            component: () => import("@/pages/SettingsPage.vue"),
            name: "settings",
            meta: {
                title: "title.settings",
                analyticsIgnore: true,
            },
        },

        {
            path: "/bookmarks",
            component: () => import("@/pages/BookmarksPage.vue"),
            name: "bookmarks",
            meta: {
                title: "title.bookmarks",
            },
        },

        // Note that this route should always come after all defined routes,
        // to prevent wrongly configured slugs from taking over pages
        {
            path: "/:slug",
            component: () => import("@/pages/SingleContent.vue"),
            name: "content",
            props: true,
        },

        {
            path: "/:pathMatch(.*)*",
            name: "404",
            component: () => import("@/pages/NotFoundPage.vue"),
            meta: {
                analyticsIgnore: true,
            },
        },
    ],
});

export default router;
