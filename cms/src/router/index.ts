import { createRouter, createWebHistory } from "vue-router";
import HomeView from "@/views/HomeView.vue";
import { authGuard } from "@auth0/auth0-vue";
import { nextTick } from "vue";
import { useGlobalConfigStore } from "@/stores/globalConfig";

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: "/",
            beforeEnter: authGuard,
            children: [
                {
                    path: "/",
                    name: "dashboard",
                    component: HomeView,
                    meta: {
                        title: "Dashboard",
                    },
                },
                {
                    path: "/posts",
                    name: "posts",
                    component: () => import("../views/AboutView.vue"),
                    meta: {
                        title: "Posts",
                    },
                },
                {
                    path: "/videos",
                    name: "videos",
                    component: () => import("../views/AboutView.vue"),
                    meta: {
                        title: "Videos",
                    },
                },
                {
                    path: "/users",
                    name: "users",
                    component: () => import("../views/AboutView.vue"),
                    meta: {
                        title: "Users",
                    },
                },
            ],
        },
    ],
});

router.afterEach((to) => {
    const { appName } = useGlobalConfigStore();

    nextTick(() => {
        document.title = `${to.meta.title} - ${appName} CMS` || `${appName} CMS`;
    });
});

export default router;
