import type { RouteRecordRaw } from "vue-router";

// All route components are lazy: this keeps the SSG prerender surface small and avoids a circular import (component → "@/router" → "./routes") that would cause a TDZ error during SSR.
const HomePage = () => import("@/pages/HomePage.vue");
const InAppBrowserCheck = () => import("@/pages/InAppBrowserCheck.vue");
const ExplorePage = () => import("@/pages/ExplorePage.vue");
const SearchPage = () => import("@/pages/SearchPage.vue");
const VideoPage = () => import("@/pages/VideoPage.vue");
const SettingsPage = () => import("@/pages/SettingsPage.vue");
const BookmarksPage = () => import("@/pages/BookmarksPage.vue");
const SingleContent = () => import("@/pages/SingleContent/SingleContent.vue");
const NotFoundPage = () => import("@/pages/NotFoundPage.vue");
const AuthDesignPage = () => import("@/pages/design/AuthDesignPage.vue");
const KratosAuthPage = () => import("@/pages/auth/KratosAuthPage.vue");

/**
 * Kratos self-service screens. Registered only when VITE_KRATOS_URL is set, so
 * the proof of concept is inert everywhere it hasn't been switched on. The paths
 * must match the `ui_url`s in the Kratos config.
 */
const kratosRoutes: RouteRecordRaw[] = import.meta.env.VITE_KRATOS_URL
    ? (
          [
              ["/auth/login", "login"],
              ["/auth/signup", "registration"],
              ["/auth/verify", "verification"],
              ["/auth/recovery", "recovery"],
              ["/auth/account", "settings"],
          ] as const
      ).map(([path, flowType]) => ({
          path,
          component: KratosAuthPage,
          name: `kratos-${flowType}`,
          props: { flowType },
          meta: {
              analyticsIgnore: true,
              devOnly: true,
          },
      }))
    : [];

/**
 * Design canvas for the Kratos auth screens. Development only — it renders every
 * screen and state side by side and ships in no build.
 */
const designRoutes: RouteRecordRaw[] = import.meta.env.DEV
    ? [
          {
              path: "/design/auth",
              component: AuthDesignPage,
              name: "design-auth",
              meta: {
                  analyticsIgnore: true,
                  devOnly: true,
              },
          },
      ]
    : [];

/**
 * The shared route table for both the normal SPA entry and the web/SSG entry. `meta.prerender: true` marks public, crawlable routes the web build emits as static HTML; dynamic content slugs are enumerated from the API at build time.
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
            prerender: true,
        },
    },
    {
        path: "/search",
        component: SearchPage,
        name: "search",
        meta: {
            title: "title.search",
            prerender: true,
        },
    },
    {
        path: "/watch",
        component: VideoPage,
        name: "watch",
        meta: {
            title: "title.watch",
            prerender: true,
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
    ...designRoutes,
    ...kratosRoutes,
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
    // Static 404 page. Prerendered to `dist-web/404.html` so the deploy repo can
    // serve it as a worker custom error page on unmatched paths. vue-router ranks
    // this static path above `/:slug`, so `/404` resolves here (not SingleContent).
    {
        path: "/404",
        component: NotFoundPage,
        name: "not-found",
        meta: {
            analyticsIgnore: true,
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
