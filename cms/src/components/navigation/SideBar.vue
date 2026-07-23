<script setup lang="ts">
import { RouterLink } from "vue-router";
import {
    DocumentDuplicateIcon,
    TagIcon,
    HomeIcon,
    ChevronRightIcon,
    ChevronLeftIcon,
    GlobeEuropeAfricaIcon,
    ArrowUturnRightIcon,
    CloudIcon,
    ShieldCheckIcon,
    Cog6ToothIcon,
    LanguageIcon,
    ArrowRightEndOnRectangleIcon,
    ArrowDownTrayIcon,
    UserIcon,
    SparklesIcon,
} from "@heroicons/vue/20/solid";

import {
    appName,
    cmsLanguageIdAsRef,
    isDevMode,
    isMobileScreen,
    logo,
    sidebarSectionExpanded,
} from "@/globalConfig";
import { useDesktopSidebar } from "@/composables/useDesktopSidebar";
import { useInstallPrompt } from "@/composables/useInstallPrompt";
import { computed, ref } from "vue";
import {
    AclPermission,
    DocType,
    PostType,
    TagType,
    hasAnyPermission,
    isConnected,
    useSharedHybridQuery,
    type LanguageDto,
} from "luminary-shared";
import { isAuthBypassed, isAuthPluginInstalled, useAuth } from "@/auth";
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
// so this is a no-op there.
const open = defineModel<boolean>("open", { default: false });

// Desktop collapse: shrinks the column to an icon-only rail. The state is shared with App.vue (which
// drives the grid column width). The collapsed *visuals* only apply on lg+ — on a small screen the
// sidebar is a full-width drawer, so we never want to hide the labels there even if `collapsed` is set.
const { collapsed, toggleCollapsed } = useDesktopSidebar();
const isCollapsed = computed(() => collapsed.value && !isMobileScreen.value);
const { isInstallable, manualInstallInstructions, promptInstall } = useInstallPrompt();

const navigation = computed(() => [
    { name: "Dashboard", to: { name: "dashboard" }, icon: HomeIcon, visible: true },
    {
        name: "Posts",
        icon: DocumentDuplicateIcon,
        open: sidebarSectionExpanded.value.posts,
        visible: hasAnyPermission(DocType.Post, AclPermission.CmsView),
        children: Object.entries(PostType).map((p) => ({
            name: p[0],
            to: { name: "overview", params: { docType: DocType.Post, tagOrPostType: p[1] } },
        })),
    },
    {
        name: "Tags",
        icon: TagIcon,
        open: sidebarSectionExpanded.value.tags,
        visible: hasAnyPermission(DocType.Tag, AclPermission.CmsView),
        children: Object.entries(TagType).map((t) => ({
            name: t[0],
            to: { name: "overview", params: { docType: DocType.Tag, tagOrPostType: t[1] } },
        })),
    },
    {
        name: "Redirects",
        to: { name: "redirects" },
        icon: ArrowUturnRightIcon,
        visible: hasAnyPermission(DocType.Redirect, AclPermission.CmsView),
    },
    {
        name: "Recommendations",
        to: { name: "recommendations" },
        icon: SparklesIcon,
        visible: hasAnyPermission(DocType.DefaultAffinity, AclPermission.CmsView),
    },
    {
        name: "Languages",
        to: { name: "languages" },
        icon: GlobeEuropeAfricaIcon,
        visible: hasAnyPermission(DocType.Language, AclPermission.CmsView),
    },
    {
        name: "Storage",
        to: { name: "storage" },
        icon: CloudIcon,
        visible: hasAnyPermission(DocType.Storage, AclPermission.CmsView),
    },
    {
        name: "Access",
        icon: ShieldCheckIcon,
        open: sidebarSectionExpanded.value.access,
        visible:
            hasAnyPermission(DocType.User, AclPermission.CmsView) ||
            hasAnyPermission(DocType.Group, AclPermission.CmsView) ||
            hasAnyPermission(DocType.AutoGroupMappings, AclPermission.CmsView) ||
            hasAnyPermission(DocType.AuthProvider, AclPermission.Edit),
        children: [
            ...(hasAnyPermission(DocType.User, AclPermission.CmsView)
                ? [{ name: "Users", to: { name: "users" } }]
                : []),
            ...(hasAnyPermission(DocType.Group, AclPermission.CmsView)
                ? [{ name: "Groups", to: { name: "groups" } }]
                : []),
            ...(hasAnyPermission(DocType.AuthProvider, AclPermission.Edit)
                ? [{ name: "Auth Providers", to: { name: "auth-providers" } }]
                : []),
            ...(hasAnyPermission(DocType.AutoGroupMappings, AclPermission.CmsView)
                ? [{ name: "Auto Group Mappings", to: { name: "auto-group-mappings" } }]
                : []),
        ],
    },
]);

// Maps a collapsible nav group's display name to its `sidebarSectionExpanded` key.
const sectionKeyByName: Record<string, "posts" | "tags" | "access"> = {
    Posts: "posts",
    Tags: "tags",
    Access: "access",
};

// Tracks the nav group (if any) whose click auto-expanded a collapsed desktop sidebar, so that
// collapsing that same group collapses the sidebar back to the rail.
const autoExpandedByGroup = ref<string | null>(null);

const toggleOpen = (item: NavigationEntry) => {
    const key = sectionKeyByName[item.name];
    if (!key) return;

    // From the collapsed desktop rail, clicking a group just expands the sidebar and opens that
    // group (the sub-items are hidden while collapsed, so toggling them in place does nothing).
    if (isCollapsed.value) {
        collapsed.value = false;
        sidebarSectionExpanded.value[key] = true;
        autoExpandedByGroup.value = item.name;
        return;
    }

    const wasOpen = sidebarSectionExpanded.value[key];
    sidebarSectionExpanded.value[key] = !wasOpen;

    if (wasOpen) {
        // Collapsing the group that auto-expanded the sidebar re-collapses the sidebar.
        if (autoExpandedByGroup.value === item.name) {
            collapsed.value = true;
            autoExpandedByGroup.value = null;
        }
    } else {
        // Opening a group while already expanded drops any pending auto-collapse association.
        autoExpandedByGroup.value = null;
    }
};

// Manually toggling the rail clears the auto-collapse association so a later group-close doesn't
// unexpectedly collapse the sidebar.
const onToggleCollapsed = () => {
    autoExpandedByGroup.value = null;
    toggleCollapsed();
};

// Close the mobile drawer after navigating (no-op on desktop where `open` is already false).
const closeDrawer = () => {
    open.value = false;
};

// --- Footer: user, language, logout ---
// Only use the configured OIDC manager if it was actually installed at boot.
// Otherwise fall back to mock user data and a no-op logout.
const auth = isAuthBypassed || !isAuthPluginInstalled.value ? null : useAuth();
const user = computed(() =>
    isAuthBypassed
        ? { name: "E2E Test User", email: "e2e@test.local", picture: undefined }
        : auth?.user.value,
);
const logout = auth
    ? auth.logout
    : () => console.warn("Logout called without an active auth session");

const languages = useSharedHybridQuery<LanguageDto>(
    () => ({ selector: { type: DocType.Language } }),
    { live: true },
);
const currentLanguageName = computed(
    () => languages.value.find((l) => l._id === cmsLanguageIdAsRef.value)?.name ?? "",
);

const showLanguageModal = ref(false);
const showLogoutDialog = ref(false);
const showInstallInstructions = ref(false);

const confirmLogout = () => {
    // Close now, not after logout(): a real IdP redirect unloads the page
    // anyway, and if the redirect fails (no end_session_endpoint) the dialog
    // shouldn't stay stuck open — LDialog doesn't close itself on primaryAction.
    showLogoutDialog.value = false;
    // logout() already clears local state in the right order — don't call
    // clearAuthCache() here first, or it turns logout() into a no-op (it
    // reads the installed OIDC manager, which clearAuthCache() would null).
    logout();
};

const navIconClass = "h-5 w-5 shrink-0";
// When collapsed (desktop only) nav rows center their icon and drop the label gap/padding.
const navItemClass = computed(() => [
    "mb-1 flex rounded-md text-sm font-medium text-zinc-600 hover:bg-zinc-200",
    isCollapsed.value ? "justify-center p-2.5" : "items-center gap-3 px-3 py-2.5",
]);
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
        class="fixed inset-y-0 left-0 z-50 flex h-screen w-72 flex-col border-r border-zinc-200 bg-zinc-100 transition-[transform,width] duration-200 ease-out lg:relative lg:z-30 lg:translate-x-0"
        :class="[
            open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
            collapsed ? 'lg:w-[4.5rem]' : 'lg:w-72',
        ]"
    >
        <!-- Collapse toggle — sits on the right edge, vertically centred. Desktop only. -->
        <button
            type="button"
            class="absolute right-0 top-1/2 z-20 hidden h-8 w-8 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-600 shadow-md transition-colors hover:bg-zinc-50 hover:text-zinc-800 lg:flex"
            :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
            data-test="sidebar-collapse-toggle"
            @click="onToggleCollapsed"
        >
            <ChevronLeftIcon v-if="!collapsed" class="h-4 w-4" aria-hidden="true" />
            <ChevronRightIcon v-else class="h-4 w-4" aria-hidden="true" />
        </button>

        <!-- Logo — connectivity badge sits next to it and only shows when offline -->
        <div
            class="flex h-16 w-full shrink-0 items-center gap-2 pt-1"
            :class="isCollapsed ? 'justify-center px-2' : 'pl-5 pr-3'"
        >
            <img
                :src="logo"
                :alt="appName"
                :class="isCollapsed ? 'h-8 max-w-full object-contain' : 'h-8'"
            />
            <span
                v-if="isDevMode && !isCollapsed"
                class="rounded-lg bg-red-400 px-1 py-0.5 text-sm text-red-950"
            >
                DEV
            </span>
            <OnlineIndicator v-if="!isConnected && !isCollapsed" icon-only class="ml-auto" />
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
                        :title="item.name"
                        @click="closeDrawer"
                    >
                        <component :is="item.icon" :class="navIconClass" aria-hidden="true" />
                        <span v-if="!isCollapsed">{{ item.name }}</span>
                    </RouterLink>

                    <div v-else-if="item.visible && item.children">
                        <button
                            type="button"
                            :class="[navItemClass, 'w-full text-left']"
                            :title="item.name"
                            @click="toggleOpen(item)"
                        >
                            <component :is="item.icon" :class="navIconClass" aria-hidden="true" />
                            <template v-if="!isCollapsed">
                                {{ item.name }}
                                <ChevronRightIcon
                                    :class="[
                                        item.open ? 'rotate-90 text-zinc-500' : 'text-zinc-400',
                                        'ml-auto h-5 w-5 shrink-0',
                                    ]"
                                    aria-hidden="true"
                                />
                            </template>
                        </button>

                        <ul v-show="item.open && !isCollapsed" class="mb-1 space-y-1 px-2">
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

            <!-- Preferences: language, settings -->
            <div class="mt-2 border-t border-zinc-200 pt-3">
                <button
                    type="button"
                    :class="[navItemClass, 'w-full text-left']"
                    :title="currentLanguageName ? `Language — ${currentLanguageName}` : 'Language'"
                    @click="showLanguageModal = true"
                >
                    <LanguageIcon :class="navIconClass" aria-hidden="true" />
                    <span v-if="!isCollapsed" class="flex min-w-0 flex-col leading-none">
                        <span>{{ currentLanguageName }}</span>
                    </span>
                </button>

                <RouterLink
                    :to="{ name: 'settings' }"
                    active-class="bg-zinc-200 text-zinc-900"
                    :class="navItemClass"
                    title="Settings"
                    @click="closeDrawer"
                >
                    <Cog6ToothIcon :class="navIconClass" aria-hidden="true" />
                    <span v-if="!isCollapsed">Settings</span>
                </RouterLink>
            </div>
        </nav>

        <div
            v-if="isInstallable || manualInstallInstructions"
            class="border-t border-zinc-200 py-3"
            :class="isCollapsed ? 'px-2' : 'px-3'"
        >
            <button
                type="button"
                :class="[
                    'flex w-full rounded-md text-sm font-medium text-zinc-600 hover:bg-zinc-200',
                    isCollapsed
                        ? 'justify-center p-2.5'
                        : 'items-center gap-3 px-3 py-2.5 text-left',
                ]"
                title="Install"
                data-test="install-app"
                @click="isInstallable ? promptInstall() : (showInstallInstructions = true)"
            >
                <ArrowDownTrayIcon :class="navIconClass" aria-hidden="true" />
                <span v-if="!isCollapsed">Install</span>
            </button>
        </div>

        <!-- Account: sign out + signed-in user, pinned to the bottom (like the app) -->
        <div class="border-t border-zinc-200 py-3" :class="isCollapsed ? 'px-2' : 'px-3'">
            <button
                type="button"
                :class="[
                    'mb-2 flex w-full rounded-md text-sm font-medium text-zinc-600 hover:bg-zinc-200',
                    isCollapsed
                        ? 'justify-center p-2.5'
                        : 'items-center gap-3 px-3 py-2.5 text-left',
                ]"
                title="Sign out"
                data-test="sign-out"
                @click="showLogoutDialog = true"
            >
                <ArrowRightEndOnRectangleIcon :class="navIconClass" aria-hidden="true" />
                <span v-if="!isCollapsed">Sign out</span>
            </button>

            <div
                :class="[
                    'flex items-center rounded-md py-1.5',
                    isCollapsed ? 'justify-center' : 'gap-3 pl-3',
                ]"
                :title="user?.name || user?.email"
            >
                <img
                    v-if="user?.picture"
                    :src="user.picture"
                    alt=""
                    class="h-5 w-5 shrink-0 rounded-full bg-zinc-50 object-cover"
                />
                <div
                    v-else
                    class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-300"
                >
                    <UserIcon class="h-3.5 w-3.5 text-zinc-600" />
                </div>
                <span
                    v-if="!isCollapsed"
                    class="min-w-0 flex-1 truncate text-sm font-medium text-zinc-700"
                >
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

    <LDialog
        v-model:open="showInstallInstructions"
        title="Install"
        :description="manualInstallInstructions ?? undefined"
        :primaryAction="() => (showInstallInstructions = false)"
        primaryButtonText="Got it"
        data-test="manual-install-instructions"
    />
</template>
