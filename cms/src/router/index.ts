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
            redirect: { name: "dashboard" },
            children: [
                {
                    path: "sandbox",
                    name: "sandbox",
                    component: () => import("../pages/internal/ComponentSandbox.vue"),
                },
                {
                    path: "dashboard",
                    name: "dashboard",
                    component: Dashboard,
                    meta: {
                        title: "Dashboard",
                    },
                },
                {
                    path: "posts",
                    name: "posts",
                    redirect: { name: "posts.index" },
                    children: [
                        {
                            path: "",
                            name: "posts.index",
                            component: () => import("../pages/posts/PostOverview.vue"),
                            meta: {
                                title: "Posts",
                            },
                        },
                        {
                            path: "create",
                            name: "posts.create",
                            component: () => import("../pages/posts/CreatePost.vue"),
                            meta: {
                                title: "Create Post",
                            },
                        },
                    ],
                },
                {
                    path: "videos",
                    name: "videos",
                    redirect: { name: "videos.index" },
                    children: [
                        {
                            path: "",
                            name: "videos.index",
                            component: () => import("../pages/VideosPage.vue"),
                            meta: {
                                title: "Videos",
                            },
                        },
                    ],
                },
                {
                    path: "users",
                    name: "users",
                    redirect: { name: "users.index" },
                    children: [
                        {
                            path: "",
                            name: "users.index",
                            component: () => import("../pages/UsersPage.vue"),
                            meta: {
                                title: "Users",
                            },
                        },
                    ],
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
