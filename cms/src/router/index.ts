import { createRouter, createWebHistory } from "vue-router";
import Dashboard from "@/pages/DashboardPage.vue";
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
                    component: Dashboard,
                    meta: {
                        title: "Dashboard",
                    },
                },
                {
                    path: "/posts",
                    name: "posts",
                    component: () => import("../pages/PostsPage.vue"),
                    meta: {
                        title: "Posts",
                    },
                },
                {
                    path: "/videos",
                    name: "videos",
                    component: () => import("../pages/VideosPage.vue"),
                    meta: {
                        title: "Videos",
                    },
                },
                {
                    path: "/users",
                    name: "users",
                    component: () => import("../pages/UsersPage.vue"),
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
