import type { RouteRecordRaw } from "vue-router";

const HomePage = () => import("@/pages/HomePage.vue");
const ExplorePage = () => import("@/pages/ExplorePage.vue");
const VideoPage = () => import("@/pages/VideoPage.vue");

export function localizedStaticRoutes(langCodes: string[], defaultCode: string): RouteRecordRaw[] {
    const codes = [...new Set(langCodes)].filter((code) => code && code !== defaultCode);
    return codes.flatMap((code) => [
        {
            path: `/${code}`,
            component: HomePage,
            name: `home-${code}`,
            meta: { title: "title.home", analyticsIgnore: true, prerender: true, lang: code },
        },
        {
            path: `/${code}/explore`,
            component: ExplorePage,
            name: `explore-${code}`,
            meta: { title: "title.explore", prerender: true, lang: code },
        },
        {
            path: `/${code}/watch`,
            component: VideoPage,
            name: `watch-${code}`,
            meta: { title: "title.watch", prerender: true, lang: code },
        },
    ]);
}
