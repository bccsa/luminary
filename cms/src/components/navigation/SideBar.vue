<script setup lang="ts">
import { RouterLink } from "vue-router";
import {
    DocumentDuplicateIcon,
    TagIcon,
    HomeIcon,
    ChevronRightIcon,
    GlobeEuropeAfricaIcon,
    ArrowUturnRightIcon,
    CloudIcon,
    ShieldCheckIcon,
    Cog6ToothIcon,
    LanguageIcon,
    ArrowRightEndOnRectangleIcon,
    UserIcon,
} from "@heroicons/vue/20/solid";
import { PlayIcon } from "@heroicons/vue/16/solid";

import {
    appName,
    cmsLanguageIdAsRef,
    isDevMode,
    logo,
    sidebarSectionExpanded,
} from "@/globalConfig";
import { computed, ref } from "vue";
import {
    AclPermission,
    DocType,
    PostType,
    TagType,
    hasAnyPermission,
    isConnected,
    useHybridQuery,
    type LanguageDto,
} from "luminary-shared";
import { useAuth0 } from "@auth0/auth0-vue";
import { clearAuth0Cache, isAuthBypassed, isAuthPluginInstalled } from "@/auth";
import OnlineIndicator from "../OnlineIndicator.vue";
import LanguageModal from "../modals/LanguageModal.vue";
import LDialog from "../common/LDialog.vue";

type NavigationEntry = {
    name: string;
    to?: { name: string; params?: Record<string, string | number> };
    icon?: any;
    open?: boolean;
    visible?: boolean;
    children?: NavigationEntry[];
};

// `open` drives the mobile drawer (slide-in overlay). On lg+ the sidebar is always a static column,
// so this is a no-op there. Replaces the old MobileSideBar wrapper + its `update:open` plumbing.
const open = defineModel<boolean>("open", { default: false });

const navigation = computed(() => [
    { name: "Dashboard", to: { name: "dashboard" }, icon: HomeIcon, visible: true },
    {
        name: "Posts",
        icon: DocumentDuplicateIcon,
        open: sidebarSectionExpanded.value.posts,
        visible: hasAnyPermission(DocType.Post, AclPermission.View),
        children: Object.entries(PostType).map((p) => ({
            name: p[0],
            to: { name: "overview", params: { docType: DocType.Post, tagOrPostType: p[1] } },
        })),
    },
    {
        name: "Tags",
        icon: TagIcon,
        open: sidebarSectionExpanded.value.tags,
        visible: hasAnyPermission(DocType.Tag, AclPermission.View),
        children: Object.entries(TagType).map((t) => ({
            name: t[0],
            to: { name: "overview", params: { docType: DocType.Tag, tagOrPostType: t[1] } },
        })),
    },
    {
        name: "Redirects",
        to: { name: "redirects" },
        icon: ArrowUturnRightIcon,
        visible: hasAnyPermission(DocType.Redirect, AclPermission.View),
    },
    {
        name: "Languages",
        to: { name: "languages" },
        icon: GlobeEuropeAfricaIcon,
        visible: hasAnyPermission(DocType.Language, AclPermission.View),
    },
    {
        name: "Storage",
        to: { name: "storage" },
        icon: CloudIcon,
        visible: hasAnyPermission(DocType.Storage, AclPermission.View),
    },
    {
        name: "Access",
        icon: ShieldCheckIcon,
        open: sidebarSectionExpanded.value.access,
        visible:
            hasAnyPermission(DocType.User, AclPermission.View) ||
            hasAnyPermission(DocType.Group, AclPermission.View) ||
            hasAnyPermission(DocType.AutoGroupMappings, AclPermission.View) ||
            hasAnyPermission(DocType.AuthProvider, AclPermission.Edit),
        children: [
            ...(hasAnyPermission(DocType.User, AclPermission.View)
                ? [{ name: "Users", to: { name: "users" } }]
                : []),
            ...(hasAnyPermission(DocType.Group, AclPermission.View)
                ? [{ name: "Groups", to: { name: "groups" } }]
                : []),
            ...(hasAnyPermission(DocType.AuthProvider, AclPermission.Edit)
                ? [{ name: "Auth Providers", to: { name: "auth-providers" } }]
                : []),
            ...(hasAnyPermission(DocType.AutoGroupMappings, AclPermission.View)
                ? [{ name: "Auto Group Mappings", to: { name: "auto-group-mappings" } }]
                : []),
        ],
    },
]);

const toggleOpen = (item: NavigationEntry) => {
    if (item.name === "Posts") {
        sidebarSectionExpanded.value.posts = !sidebarSectionExpanded.value.posts;
    } else if (item.name === "Tags") {
        sidebarSectionExpanded.value.tags = !sidebarSectionExpanded.value.tags;
    } else if (item.name === "Access") {
        sidebarSectionExpanded.value.access = !sidebarSectionExpanded.value.access;
    }
};

// Close the mobile drawer after navigating (no-op on desktop where `open` is already false).
const closeDrawer = () => {
    open.value = false;
};

// --- Footer (was ProfileMenu): user, language, logout ---
// Only call useAuth0() if the plugin was actually installed at boot. Otherwise fall back to mock
// user data and a no-op logout.
const auth0 = isAuthBypassed || !isAuthPluginInstalled.value ? null : useAuth0();
const user = computed(() =>
    isAuthBypassed ? { name: "E2E Test User", email: "e2e@test.local" } : auth0?.user.value,
);
const logout = auth0
    ? auth0.logout
    : () => console.warn("Logout called without an active auth session");

const languages = useHybridQuery<LanguageDto>(() => ({ selector: { type: DocType.Language } }), {
    live: true,
});
const currentLanguageName = computed(
    () => languages.value.find((l) => l._id === cmsLanguageIdAsRef.value)?.name ?? "",
);

const showLanguageModal = ref(false);
const showLogoutDialog = ref(false);

const confirmLogout = () => {
    // Wipe local Auth0 footprint synchronously so that an interrupted logout redirect doesn't
    // leave stale provider state behind.
    clearAuth0Cache();
    logout({ logoutParams: { returnTo: window.location.origin } });
};

const navItemClass =
    "mb-1 flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-200";
const navIconClass = "h-5 w-5 shrink-0";
</script>

<template>
    <!-- Backdrop: mobile only, when the drawer is open. lg:hidden so it never shows on desktop. -->
    <div
        v-if="open"
        class="fixed inset-0 z-40 bg-zinc-900/50 lg:hidden"
        data-test="mobile-sidebar-backdrop"
        @click="open = false"
    />

    <!-- One panel for both presentations: a fixed slide-in drawer on mobile, a static column on lg+. -->
    <aside
        data-test="sidebar"
        @scroll.stop
        class="fixed inset-y-0 left-0 z-50 flex h-screen w-72 flex-col border-r border-zinc-200 bg-zinc-100 transition-transform duration-200 ease-out lg:static lg:z-auto lg:w-full lg:translate-x-0"
        :class="open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'"
    >
        <!-- Logo — connectivity badge sits next to it and only shows when offline -->
        <div class="flex h-16 w-full shrink-0 items-center gap-2 pl-5 pr-3 pt-1">
            <img class="h-8" :src="logo" :alt="appName" />
            <span
                v-if="isDevMode"
                class="rounded-lg bg-red-400 px-1 py-0.5 text-sm text-red-950"
            >
                DEV
            </span>
            <OnlineIndicator v-if="!isConnected" class="ml-auto" />
        </div>

        <!-- Primary navigation + preferences (preferences sit directly below the nav, like the app) -->
        <nav class="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 scrollbar-hide">
            <ul role="list">
                <li v-for="item in navigation" :key="item.name">
                    <RouterLink
                        v-if="item.visible && !item.children && item.to"
                        :to="item.to"
                        active-class="bg-zinc-200 text-zinc-900"
                        :class="navItemClass"
                        @click="closeDrawer"
                    >
                        <component :is="item.icon" :class="navIconClass" aria-hidden="true" />
                        {{ item.name }}
                    </RouterLink>

                    <div v-else-if="item.visible && item.children">
                        <button
                            type="button"
                            :class="[navItemClass, 'w-full text-left']"
                            @click="toggleOpen(item)"
                        >
                            <component :is="item.icon" :class="navIconClass" aria-hidden="true" />
                            {{ item.name }}
                            <ChevronRightIcon
                                :class="[
                                    item.open ? 'rotate-90 text-zinc-500' : 'text-zinc-400',
                                    'ml-auto h-5 w-5 shrink-0',
                                ]"
                                aria-hidden="true"
                            />
                        </button>

                        <ul v-show="item.open" class="mb-1 space-y-1 px-2">
                            <li v-for="subItem in item.children" :key="subItem.name">
                                <RouterLink
                                    :to="subItem.to"
                                    active-class="bg-zinc-200 text-zinc-900"
                                    class="block rounded-md py-2 pl-9 pr-2 text-sm font-medium text-zinc-600 hover:bg-zinc-200"
                                    @click="closeDrawer"
                                >
                                    {{ subItem.name }}
                                </RouterLink>
                            </li>
                        </ul>
                    </div>
                </li>
            </ul>

            <!-- Preferences: language, settings, sandbox (dev) -->
            <div class="mt-2 border-t border-zinc-200 pt-3">
                <button
                    type="button"
                    :class="[navItemClass, 'w-full text-left']"
                    @click="showLanguageModal = true"
                >
                    <LanguageIcon :class="navIconClass" aria-hidden="true" />
                    <span class="flex min-w-0 flex-col leading-none">
                        <span>Language</span>
                        <span
                            v-if="currentLanguageName"
                            class="mt-0.5 truncate text-xs text-zinc-500"
                        >
                            {{ currentLanguageName }}
                        </span>
                    </span>
                </button>

                <RouterLink
                    :to="{ name: 'settings' }"
                    active-class="bg-zinc-200 text-zinc-900"
                    :class="navItemClass"
                    @click="closeDrawer"
                >
                    <Cog6ToothIcon :class="navIconClass" aria-hidden="true" />
                    Settings
                </RouterLink>

                <RouterLink
                    v-if="isDevMode"
                    :to="{ name: 'sandbox' }"
                    active-class="bg-zinc-200 text-zinc-900"
                    :class="navItemClass"
                    @click="closeDrawer"
                >
                    <PlayIcon :class="navIconClass" aria-hidden="true" />
                    Sandbox
                </RouterLink>
            </div>
        </nav>

        <!-- Account: sign out + signed-in user, pinned to the bottom (like the app) -->
        <div class="border-t border-zinc-200 px-2 py-3">
            <button
                type="button"
                class="mb-2 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-zinc-600 hover:bg-zinc-200"
                data-test="sign-out"
                @click="showLogoutDialog = true"
            >
                <ArrowRightEndOnRectangleIcon :class="navIconClass" aria-hidden="true" />
                Sign out
            </button>

            <div class="flex items-center gap-3 rounded-md py-1.5 pl-3" :title="user?.name || user?.email">
                <img
                    v-if="user?.picture"
                    :src="user.picture"
                    alt=""
                    class="h-8 w-8 shrink-0 rounded-full bg-zinc-50 object-cover"
                />
                <div
                    v-else
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-300"
                >
                    <UserIcon class="h-5 w-5 text-zinc-600" />
                </div>
                <span class="min-w-0 flex-1 truncate text-sm font-medium text-zinc-700">
                    {{ user?.name || user?.email }}
                </span>
            </div>
        </div>
    </aside>

    <LanguageModal v-model:is-visible="showLanguageModal" />

    <LDialog
        v-model:open="showLogoutDialog"
        title="Sign out"
        description="Are you sure you want to sign out?"
        context="danger"
        :primaryAction="confirmLogout"
        primaryButtonText="Sign out"
        :secondaryAction="() => (showLogoutDialog = false)"
        secondaryButtonText="Cancel"
    />
</template>
