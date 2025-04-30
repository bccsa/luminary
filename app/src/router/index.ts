import { createRouter, createWebHistory } from "vue-router";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import HomePage from "@/pages/HomePage.vue";
import SettingsPage from "@/pages/SettingsPage.vue";
import SingleContent from "@/pages/SingleContent.vue";
import ExplorePage from "@/pages/ExplorePage.vue";
import BookmarksPage from "@/pages/BookmarksPage.vue";
import VideoPage from "@/pages/VideoPage.vue";
import { db, DocType, useDexieLiveQuery, type RedirectDto } from "luminary-shared";

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
        },

        {
            path: "/:pathMatch(.*)*",
            name: "404",
            component: NotFoundPage,
            meta: {
                analyticsIgnore: true,
            },
        },
    ],
});

router.beforeEach(async (to) => {
    const currentSlug = to.params.slug;

    if (!currentSlug) return true;

    const dbRedirects = (await db.docs
        .where("type")
        .equals(DocType.Redirect)
        .toArray()) as RedirectDto[];

    const isRedirect = dbRedirects.find((redirect) => redirect.slug === currentSlug);

    if (isRedirect) {
        return `/${isRedirect.toSlug}`;
    }

    return true;
});

export default router;
