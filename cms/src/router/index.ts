import { createRouter, createWebHistory } from "vue-router";
import DashboardView from "@/pages/Dashboard.vue";
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
                    component: DashboardView,
                    meta: {
                        title: "Dashboard",
                    },
                },
                {
                    path: "/posts",
                    name: "posts",
                    component: () => import("../pages/Posts.vue"),
                    meta: {
                        title: "Posts",
                    },
                },
                {
                    path: "/videos",
                    name: "videos",
                    component: () => import("../pages/Videos.vue"),
                    meta: {
                        title: "Videos",
                    },
                },
                {
                    path: "/users",
                    name: "users",
                    component: () => import("../pages/Users.vue"),
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
        document.title = to.meta.title ? `${to.meta.title} - ${appName}` : appName;
    });
});

export default router;
