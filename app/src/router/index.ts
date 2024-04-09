import { createRouter, createWebHistory } from "vue-router";
import { nextTick } from "vue";
import { useGlobalConfigStore } from "@/stores/globalConfig";
import NotFoundPage from "../pages/NotFoundPage.vue";
import HomePage from "../pages/HomePage.vue";
import { authGuard } from "@auth0/auth0-vue";
import SinglePost from "@/pages/SinglePost.vue";
import SettingsPage from "@/pages/SettingsPage.vue";

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
            beforeEnter: authGuard,
            children: [
                {
                    path: "/",
                    component: HomePage,
                    name: "home",
                    meta: {
                        title: "Home",
                    },
                },

                {
                    path: "/settings",
                    component: SettingsPage,
                    name: "settings",
                    meta: {
                        title: "Settings",
                    },
                },
                {
                    path: "/:slug",
                    component: SinglePost,
                    name: "post",
                },
                {
                    path: "/:pathMatch(.*)*",
                    name: "404",
                    component: NotFoundPage,
                },
            ],
        },
    ],
});

router.afterEach((to) => {
    const { appName } = useGlobalConfigStore();

    nextTick(() => {
        document.title = to.meta.title ? `${to.meta.title} - ${appName}` : appName;
    });
});

export default router;
