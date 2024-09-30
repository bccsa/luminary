import { createRouter, createWebHistory } from "vue-router";
import { authGuard } from "@auth0/auth0-vue";
import { nextTick } from "vue";
import { useGlobalConfigStore } from "@/stores/globalConfig";
import Dashboard from "@/pages/DashboardPage.vue";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import { AclPermission, DocType, hasAnyPermission } from "luminary-shared";
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
                // Generic content document edit route
                {
                    path: ":docType/edit/:tagType/:id/:languageCode?",
                    name: "edit",
                    component: () => import("../components/content/EditContent.vue"),
                    props: true,
                },
                // Generic content document overview route
                {
                    path: ":docType/overview/:tagType/:languageCode?",
                    name: "overview",
                    component: () => import("../components/content/ContentOverview.vue"),
                    props: true,
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
                    ],
                },
                // {
                //     path: "users",
                //     name: "users",
                //     redirect: { name: "users.index" },
                //     children: [
                //         {
                //             path: "",
                //             name: "users.index",
                //             component: () => import("../pages/UsersPage.vue"),
                //             meta: {
                //                 title: "Users",
                //                 canAccess: {
                //                     docType: DocType.User,
                //                     permission: AclPermission.View,
                //                 },
                //             },
                //         },
                //     ],
                // },
                { path: "/:pathMatch(.*)*", name: "404", component: NotFoundPage },
            ],
        },
    ],
});

router.beforeEach((to, from) => {
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
