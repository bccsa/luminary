import { createRouter, createWebHistory } from "vue-router";
import { authGuard } from "@auth0/auth0-vue";
import { nextTick } from "vue";
import { useGlobalConfigStore } from "@/stores/globalConfig";
import VideosPage from "../pages/VideosPage.vue";
import NotFoundPage from "../pages/NotFoundPage.vue";

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
            redirect: "videos",
            children: [
                {
                    path: "videos",
                    name: "videos",
                    component: VideosPage,
                    meta: {
                        title: "Videos",
                    },
                },
                { path: "/:pathMatch(.*)*", name: "404", component: NotFoundPage },
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
