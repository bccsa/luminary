import { createRouter, createWebHistory } from "vue-router";
import { authGuard } from "@auth0/auth0-vue";
import { nextTick } from "vue";
import { useGlobalConfigStore } from "@/stores/globalConfig";
import HomeView from "../views/HomeView.vue";

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
            name: "home",
            component: HomeView,
            meta: {
                title: "Home",
            },
        },
        {
            beforeEnter: authGuard,
            path: "/about",
            name: "about",
            component: () => import("../views/AboutView.vue"),
            meta: {
                title: "About",
            },
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
