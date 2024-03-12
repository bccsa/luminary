import { createRouter, createWebHistory } from "vue-router";
import { authGuard } from "@auth0/auth0-vue";
import { nextTick } from "vue";
import { useGlobalConfigStore } from "@/stores/globalConfig";
import Dashboard from "@/pages/DashboardPage.vue";
import NotFoundPage from "@/pages/NotFoundPage.vue";

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
            redirect: { name: "dashboard" },
            children: [
                {
                    path: "sandbox",
                    name: "sandbox",
                    component: () => import("../pages/internal/ComponentSandbox.vue"),
                },
                {
                    path: "api-example",
                    name: "api-example",
                    component: () => import("../pages/internal/ApiExample.vue"),
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
                        {
                            path: "edit/:id/:language?",
                            name: "posts.edit",
                            component: () => import("../pages/posts/EditPost.vue"),
                            meta: {
                                title: "Edit Post",
                            },
                        },
                    ],
                },
                {
                    path: "tags",
                    name: "tags",
                    redirect: { name: "tags.categories" },
                    children: [
                        {
                            path: "create",
                            name: "tags.create",
                            component: () => import("../pages/posts/CreatePost.vue"),
                            meta: {
                                title: "Create tag",
                            },
                        },
                        {
                            path: "edit/:id/:language?",
                            name: "tags.edit",
                            component: () => import("../pages/tags/EditTag.vue"),
                            meta: {
                                title: "Edit tag",
                            },
                        },

                        {
                            path: "categories",
                            name: "tags.categories",
                            component: () => import("../pages/tags/CategoriesOverview.vue"),
                            meta: {
                                title: "Categories",
                            },
                        },
                        {
                            path: "topics",
                            name: "tags.topics",
                            component: () => import("../pages/tags/TopicsOverview.vue"),
                            meta: {
                                title: "Topics",
                            },
                        },
                        {
                            path: "audio-playlists",
                            name: "tags.audio-playlists",
                            component: () => import("../pages/tags/AudioPlaylistsOverview.vue"),
                            meta: {
                                title: "AudioPlaylists",
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
