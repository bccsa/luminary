import { createRouter, createWebHistory } from "vue-router";
import { nextTick, watch } from "vue";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import HomePage from "@/pages/HomePage.vue";
import SettingsPage from "@/pages/SettingsPage.vue";
import SingleContent from "@/pages/SingleContent.vue";
import { appName } from "@/globalConfig";
import ExplorePage from "@/pages/ExplorePage.vue";
import BookmarksPage from "@/pages/BookmarksPage.vue";
import { initI18n } from "@/i18n";

let i18n;

async function init() {
    i18n = await initI18n();
}

init();

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

router.afterEach((to) => {
    // We handle posts in their own component
    if (to.name == "post") return;

    const { t } = i18n.global;

    watch(
        i18n.global.locale,
        () => {
            nextTick(() => {
                document.title = to.meta.title
                    ? `${t(to.meta.title as string)} - ${appName}`
                    : appName;
            });
        },
        { immediate: true },
    );
});

export default router;
