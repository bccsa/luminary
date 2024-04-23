import { createRouter, createWebHistory } from "vue-router";
import { authGuard } from "@auth0/auth0-vue";
import { nextTick } from "vue";
import { useGlobalConfigStore } from "@/stores/globalConfig";
import Dashboard from "@/pages/DashboardPage.vue";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import { AclPermission, DocType } from "@/types";
import { useUserAccessStore } from "@/stores/userAccess";
import { useNotificationStore } from "@/stores/notification";

declare module "vue-router" {
    interface RouteMeta {
        title?: string;
        canAccess?: { docType: DocType; permission: AclPermission };
    }
}

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
                    path: "dashboard",
                    name: "dashboard",
                    component: Dashboard,
                    meta: {
                        title: "Dashboard",
                    },
                },
                {
                    path: "settings",
                    name: "settings",
                    component: () => import("../pages/SettingsPage.vue"),
                    meta: {
                        title: "Settings",
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
                                canAccess: {
                                    docType: DocType.Post,
                                    permission: AclPermission.View,
                                },
                            },
                        },
                        {
                            path: "create",
                            name: "posts.create",
                            component: () => import("../pages/posts/CreatePost.vue"),
                            meta: {
                                title: "Create Post",
                                canAccess: {
                                    docType: DocType.Post,
                                    permission: AclPermission.Create,
                                },
                            },
                        },
                        {
                            path: "edit/:id/:language?",
                            name: "posts.edit",
                            component: () => import("../pages/posts/EditPost.vue"),
                            meta: {
                                title: "Edit Post",
                                canAccess: {
                                    docType: DocType.Post,
                                    permission: AclPermission.View,
                                },
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
                            path: "create/:tagType",
                            name: "tags.create",
                            component: () => import("../pages/tags/CreateTag.vue"),
                            meta: {
                                title: "Create tag",
                                canAccess: {
                                    docType: DocType.Tag,
                                    permission: AclPermission.Create,
                                },
                            },
                        },
                        {
                            path: "edit/:id/:language?",
                            name: "tags.edit",
                            component: () => import("../pages/tags/EditTag.vue"),
                            meta: {
                                title: "Edit tag",
                                canAccess: {
                                    docType: DocType.Tag,
                                    permission: AclPermission.View,
                                },
                            },
                        },

                        {
                            path: "categories",
                            name: "tags.categories",
                            component: () => import("../pages/tags/CategoriesOverview.vue"),
                            meta: {
                                title: "Categories",
                                canAccess: {
                                    docType: DocType.Tag,
                                    permission: AclPermission.View,
                                },
                            },
                        },
                        {
                            path: "topics",
                            name: "tags.topics",
                            component: () => import("../pages/tags/TopicsOverview.vue"),
                            meta: {
                                title: "Topics",
                                canAccess: {
                                    docType: DocType.Tag,
                                    permission: AclPermission.View,
                                },
                            },
                        },
                        {
                            path: "audio-playlists",
                            name: "tags.audio-playlists",
                            component: () => import("../pages/tags/AudioPlaylistsOverview.vue"),
                            meta: {
                                title: "AudioPlaylists",
                                canAccess: {
                                    docType: DocType.Tag,
                                    permission: AclPermission.View,
                                },
                            },
                        },
                    ],
                },
                {
                    path: "groups",
                    name: "groups",
                    redirect: { name: "groups.index" },
                    children: [
                        {
                            path: "",
                            name: "groups.index",
                            component: () => import("../pages/groups/GroupOverview.vue"),
                            meta: {
                                title: "Groups",
                                canAccess: {
                                    docType: DocType.Group,
                                    permission: AclPermission.View,
                                },
                            },
                        },
                        {
                            path: "create",
                            name: "groups.create",
                            component: () => import("../pages/groups/CreateGroup.vue"),
                            meta: {
                                title: "Create group",
                                canAccess: {
                                    docType: DocType.Group,
                                    permission: AclPermission.Create,
                                },
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
                                canAccess: {
                                    docType: DocType.User,
                                    permission: AclPermission.View,
                                },
                            },
                        },
                    ],
                },
                { path: "/:pathMatch(.*)*", name: "404", component: NotFoundPage },
            ],
        },
    ],
});

router.beforeEach((to, from) => {
    const { hasAnyPermission } = useUserAccessStore();
    const { addNotification } = useNotificationStore();
    if (
        to.meta.canAccess &&
        !hasAnyPermission(to.meta.canAccess.docType, to.meta.canAccess.permission)
    ) {
        addNotification({
            title: "Access denied",
            description: "You don't have access to this page",
            state: "error",
        });

        return from;
    }
});

router.afterEach((to, from, failure) => {
    if (failure) return;

    const { appName } = useGlobalConfigStore();

    nextTick(() => {
        document.title = to.meta.title ? `${to.meta.title} - ${appName}` : appName;
    });
});

export default router;
