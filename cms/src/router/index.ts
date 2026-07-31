import { createRouter, createWebHistory, START_LOCATION, type NavigationGuard } from "vue-router";
import { nextTick, watch } from "vue";
import { appName } from "@/globalConfig";
import Dashboard from "@/pages/DashboardPage.vue";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import StoragePage from "@/pages/StoragePage.vue";
import { AclPermission, DocType, hasAnyPermission, isConnected } from "luminary-shared";
import { useNotificationStore } from "@/stores/notification";
import {
    isAuthBypassed,
    isAuthPluginInstalled,
    isAuthenticated,
    loginWithProvider,
    openProviderModal,
    readPersistedProvider,
} from "@/auth";
import { waitUntilAuthIsLoaded } from "@/util/waitUntilAuthIsLoaded";

/**
 * Replaces Auth0-vue's `authGuard` (no `oidc-client-ts` equivalent exists).
 * If no OIDC manager was installed at boot, opens the provider selection
 * modal and lets navigation proceed — App.vue keeps routed content hidden
 * behind `v-if="isAuthenticated"` until a provider is picked and logged in.
 * If a manager IS installed but the session isn't currently authenticated
 * (the CMS has no unauthenticated state — an expired refresh token between
 * visits lands here), re-trigger a visible login redirect for the known
 * provider, mirroring what `authGuard` itself did automatically.
 */
const conditionalAuthGuard: NavigationGuard = async () => {
    if (isAuthBypassed) return true;
    if (!isAuthPluginInstalled.value) {
        openProviderModal();
        return true;
    }
    await waitUntilAuthIsLoaded();
    if (isAuthenticated.value) return true;

    const provider = readPersistedProvider();
    if (provider) {
        await loginWithProvider(provider, { prompt: "login" });
    } else {
        openProviderModal();
    }
    return false;
};

declare module "vue-router" {
    interface RouteMeta {
        title?: string;
        canAccess?: { docType: DocType; permission: AclPermission };
    }
}

export const router = createRouter({
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
            beforeEnter: conditionalAuthGuard,
            redirect:
                typeof import.meta.env.VITE_INITIAL_PAGE === "string" &&
                import.meta.env.VITE_INITIAL_PAGE.trim() !== ""
                    ? { path: import.meta.env.VITE_INITIAL_PAGE }
                    : { name: "dashboard" },
            children: [
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
                    path: ":docType/edit/:tagOrPostType/:id/:languageCode?",
                    name: "edit",
                    component: () => import("../components/content/EditContent.vue"),
                    props: true,
                },
                // Generic content document overview route
                {
                    path: ":docType/overview/:tagOrPostType/:languageCode?",
                    name: "overview",
                    component: () =>
                        import("../components/content/ContentOverview/ContentOverview.vue"),
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
                            component: () => import("../components/groups/GroupOverview.vue"),
                            meta: {
                                title: "Groups",
                                canAccess: {
                                    docType: DocType.Group,
                                    permission: AclPermission.CmsView,
                                },
                                onlineOnly: true,
                            },
                        },
                    ],
                },
                {
                    path: "languages",
                    name: "languages",
                    component: () => import("../components/languages/LanguageOverview.vue"),
                },
                {
                    path: "languages/:id",
                    name: "language",
                    component: () => import("../components/languages/EditLanguage.vue"),
                    props: true,
                },
                {
                    path: "redirects",
                    name: "redirects",
                    component: () => import("../components/redirects/RedirectOverview.vue"),
                },
                {
                    path: "auto-group-mappings",
                    name: "auto-group-mappings",
                    component: () =>
                        import("../components/autoGroupMappings/AutoGroupMappingOverview.vue"),
                    meta: {
                        title: "Auto Group Mappings",
                        canAccess: {
                            docType: DocType.AutoGroupMappings,
                            permission: AclPermission.CmsView,
                        },
                    },
                },

                {
                    path: "users",
                    name: "users",
                    redirect: { name: "users.index" },
                    children: [
                        {
                            path: "",
                            name: "users.index",
                            component: () => import("../components/users/UserOverview.vue"),
                            meta: {
                                title: "Users",
                                canAccess: {
                                    docType: DocType.User,
                                    permission: AclPermission.CmsView,
                                },
                            },
                        },
                    ],
                },
                {
                    path: "users/:id",
                    name: "user",
                    component: () => import("../components/users/CreateOrEditUser.vue"),
                    props: true,
                },
                {
                    path: "storage",
                    name: "storage",
                    component: StoragePage,
                    meta: {
                        title: "Storage",
                        canAccess: {
                            docType: DocType.Storage,
                            permission: AclPermission.CmsView,
                        },
                        onlineOnly: true,
                    },
                },
                {
                    path: "auth-providers",
                    name: "auth-providers",
                    component: () => import("../components/authProvider/AuthProviderOverview.vue"),
                    meta: {
                        title: "Auth Providers",
                        canAccess: {
                            docType: DocType.AuthProvider,
                            permission: AclPermission.CmsView,
                        },
                    },
                },
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

    if (to.meta.onlineOnly && !isConnected.value && from !== START_LOCATION) {
        addNotification({
            title: "Unable to open page",
            description: "This page can only be viewed online",
            state: "error",
        });

        return from;
    }
});

router.afterEach((to, from, failure) => {
    if (failure) return;

    nextTick(() => {
        document.title = to.meta.title ? `${to.meta.title} - ${appName}` : appName;
    });
});

watch(isConnected, (connected) => {
    if (connected) return;
    if (!router.currentRoute.value.meta.onlineOnly) return;

    const { addNotification } = useNotificationStore();
    addNotification({
        title: "Unable to open page",
        description: "This page can only be viewed online",
        state: "error",
    });
    router.push("/");
});

export default router;
