import type { RouteRecordRaw } from "vue-router";

// All route components are lazy. This keeps the SSG prerender surface small
// (rendering "/" only loads HomePage, "/:slug" only loads SingleContent), and —
// importantly — keeps THIS module free of an eager component import graph, which
// would otherwise create a circular import (component → "@/router" → "./routes")
// and a "Cannot access 'routes' before initialization" TDZ error during SSR.
const HomePage = () => import("@/pages/HomePage.vue");
const InAppBrowserCheck = () => import("@/pages/InAppBrowserCheck.vue");
const ExplorePage = () => import("@/pages/ExplorePage.vue");
const VideoPage = () => import("@/pages/VideoPage.vue");
const SettingsPage = () => import("@/pages/SettingsPage.vue");
const BookmarksPage = () => import("@/pages/BookmarksPage.vue");
const SingleContent = () => import("@/pages/SingleContent/SingleContent.vue");
const NotFoundPage = () => import("@/pages/NotFoundPage.vue");

/**
 * The route table, shared by both the native/SPA entry (`main.ts`, via
 * `router/index.ts`) and the web/SSG entry (`main.web.ts`, which hands these
 * to `ViteSSG`).
 *
 * `meta.prerender: true` marks a route as part of the public, crawlable tier
 * that the web build should emit as static HTML. Routes without it are
 * client-only (private, per-user, or feed-only) and are excluded from the
 * prerender enumeration in `vite.config.web.ts`. Dynamic content slugs are
 * enumerated from the API at build time (also gated on `prerender`).
 */
export const routes: RouteRecordRaw[] = [
    {
        path: "/open",
        component: InAppBrowserCheck,
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
            prerender: true,
        },
    },
    {
        path: "/explore",
        component: ExplorePage,
        name: "explore",
        meta: {
            title: "title.explore",
        },
    },
    {
        path: "/watch",
        component: VideoPage,
        name: "watch",
        meta: {
            title: "title.watch",
        },
    },
    {
        path: "/settings",
        component: SettingsPage,
        name: "settings",
        meta: {
            title: "title.settings",
            analyticsIgnore: true,
        },
    },
    {
        path: "/bookmarks",
        component: BookmarksPage,
        name: "bookmarks",
        meta: {
            title: "title.bookmarks",
        },
    },
    // Note that this route should always come after all defined routes,
    // to prevent wrongly configured slugs from taking over pages
    {
        path: "/:slug",
        component: SingleContent,
        name: "content",
        props: true,
        meta: {
            // Public content tier — individual slugs are enumerated from the
            // API at build time (see vite.config.web.ts).
            prerender: true,
        },
    },
    {
        path: "/:pathMatch(.*)*",
        name: "404",
        component: NotFoundPage,
        meta: {
            analyticsIgnore: true,
        },
    },
];
