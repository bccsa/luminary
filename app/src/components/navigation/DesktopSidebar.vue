<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { getNavigationItems } from "./navigationItems";
import { useSearchOverlay } from "@/composables/useSearchOverlay";
import { useDesktopSidebar } from "@/composables/useDesktopSidebar";
import {
    BookmarkIcon,
    Cog6ToothIcon,
    SunIcon,
    LanguageIcon,
    ShieldCheckIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
} from "@heroicons/vue/24/outline";
import {
    BookmarkIcon as FilledBookmarkIcon,
    Cog6ToothIcon as FilledCog6ToothIcon,
    UserIcon,
    ArrowRightEndOnRectangleIcon,
    ArrowLeftEndOnRectangleIcon,
} from "@heroicons/vue/24/solid";
import defaultLogo from "@/assets/logo.svg?url";
import defaultLogoDark from "@/assets/logo-dark.svg?url";
import defaultLogoSmall from "@/assets/logo-small.svg?url";
import ThemeSelectorModal from "./ThemeSelectorModal.vue";
import LanguageModal from "./LanguageModal.vue";
import LDialog from "../common/LDialog.vue";
import { appLanguageAsRef } from "@/globalConfig";
import { showPrivacyPolicyModal, useAuthWithPrivacyPolicy } from "@/composables/useAuthWithPrivacyPolicy";
import { isConnected } from "luminary-shared";
import { useNotificationStore, type Notification } from "@/stores/notification";
import { clearAuth0Cache } from "@/auth";

const { t } = useI18n();
const { openSearch, isSearchOpen } = useSearchOverlay();
const { collapsed, toggleCollapsed } = useDesktopSidebar();
const { user, logout, loginWithRedirect, isAuthenticated } = useAuthWithPrivacyPolicy();

const LOGO = import.meta.env.VITE_LOGO || defaultLogo;
const LOGO_DARK = import.meta.env.VITE_LOGO_DARK || defaultLogoDark;
const LOGO_SMALL = import.meta.env.VITE_LOGO_SMALL || defaultLogoSmall;
const LOGO_SMALL_DARK = import.meta.env.VITE_LOGO_SMALL_DARK || defaultLogoSmall;

const navigationItems = computed(() => getNavigationItems(t));

const isItemActive = (routeActive: boolean) => routeActive && !isSearchOpen.value;

const showThemeSelector = ref(false);
const showLanguageModal = ref(false);
const showLogoutDialog = ref(false);

// The sidebar itself prerenders on the web/SSG build, but the interactive
// overlays below do not — LanguageModal runs a Dexie-backed `useHybridQuery` at
// setup, which cannot execute during the Node prerender. They're never needed in
// the static HTML, so only mount them on the client (after mount). On native this
// flips true immediately.
const isMounted = ref(false);
onMounted(() => {
    isMounted.value = true;
});

const navIconClass = "h-5 w-5 flex-shrink-0";
const navLabelClass = "truncate text-sm font-medium";
const navMetaClass = "mt-0.5 truncate text-xs text-zinc-500 dark:text-slate-300";

function navItemClasses(active: boolean) {
    return [
        "mb-1 flex cursor-pointer rounded-md hover:bg-zinc-200 dark:hover:bg-slate-700",
        collapsed.value ? "justify-center p-2.5" : "items-center gap-3 px-3 py-2.5",
        active ? "text-yellow-700 dark:text-yellow-400" : "text-zinc-600 dark:text-slate-100",
    ];
}

function actionButtonClasses() {
    return [
        "mb-1 flex w-full cursor-pointer rounded-md text-zinc-600 hover:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-700",
        collapsed.value ? "justify-center p-2.5" : "items-center gap-3 px-3 py-2.5 text-left",
    ];
}

const languageTooltip = computed(() => {
    const name = appLanguageAsRef.value?.name;
    return name ? `${t("profile_menu.language")} — ${name}` : t("profile_menu.language");
});

const profileTooltip = computed(() =>
    isAuthenticated.value ? user.value?.name || user.value?.email || t("profile_menu.title") : "",
);

const showOfflineNotification = () => {
    useNotificationStore().addNotification({
        id: "no-internet-connection-logout",
        title: t("profile_menu.logout.offline_notification_title"),
        description: t("profile_menu.logout.offline_notification"),
        type: "toast",
        state: "error",
    } as Notification);
};

const handleLogout = () => {
    if (!isConnected.value) {
        showOfflineNotification();
        return;
    }
    showLogoutDialog.value = true;
};

const confirmLogout = async () => {
    if (!isConnected.value) {
        showLogoutDialog.value = false;
        showOfflineNotification();
        return;
    }
    localStorage.removeItem("usedAuth0Connection");
    clearAuth0Cache();
    await logout({ logoutParams: { returnTo: window.location.origin } });
};

const handleLogin = () => {
    if (isConnected.value) {
        loginWithRedirect();
        return;
    }
    useNotificationStore().addNotification({
        id: "no-internet-connection-login",
        title: t("profile_menu.login.offline_notification_title"),
        description: t("profile_menu.login.offline_notification"),
        type: "toast",
        state: "error",
    } as Notification);
};
</script>

<template>
    <nav
        class="relative hidden flex-shrink-0 flex-col border-r border-zinc-200 bg-zinc-100 transition-[width] duration-200 ease-out dark:border-slate-700 dark:bg-slate-800 lg:flex"
        :class="collapsed ? 'w-[4.5rem]' : 'w-64'"
    >
        <!-- Collapse toggle — sits on the right edge, vertically centred -->
        <button
            type="button"
            class="absolute right-0 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-600 shadow-md transition-colors hover:bg-zinc-50 hover:text-zinc-800 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 dark:hover:text-slate-100"
            :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
            @click="toggleCollapsed"
        >
            <ChevronLeftIcon
                v-if="!collapsed"
                class="h-4 w-4 -translate-x-0.5"
                aria-hidden="true"
            />
            <ChevronRightIcon
                v-else
                class="h-4 w-4 translate-x-0.5"
                aria-hidden="true"
            />
        </button>

        <!-- Logo — outer padding mirrors the nav container; inner padding mirrors a nav item -->
        <div :class="collapsed ? 'px-2 py-2' : 'px-3 py-2'">
            <RouterLink
                :to="{ name: 'home' }"
                :class="collapsed ? 'flex justify-center px-3 py-2' : 'flex items-center px-3 py-2'"
                :title="collapsed ? t('menu.home') : undefined"
            >
                <template v-if="collapsed">
                    <img
                        class="h-8 w-8 dark:hidden"
                        :src="LOGO_SMALL"
                        alt=""
                    />
                    <img
                        class="hidden h-8 w-8 dark:block"
                        :src="LOGO_SMALL_DARK"
                        alt=""
                    />
                </template>
                <template v-else>
                    <img
                        class="h-8 dark:hidden"
                        :src="LOGO"
                        alt=""
                    />
                    <img
                        class="hidden h-8 dark:block"
                        :src="LOGO_DARK"
                        alt=""
                    />
                </template>
            </RouterLink>
        </div>

        <!-- Nav -->
        <div
            class="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-hide"
            :class="collapsed ? 'px-2' : 'px-3'"
        >
            <RouterLink
                v-for="item in navigationItems.slice(0, -1)"
                :key="item.name"
                :to="item.to"
                v-slot="{ isActive, navigate }"
                custom
            >
                <span
                    :class="navItemClasses(isItemActive(isActive))"
                    :title="item.name"
                    @click="navigate"
                >
                    <component
                        :is="isItemActive(isActive) ? item.selectedIcon : item.defaultIcon"
                        :class="navIconClass"
                        aria-hidden="true"
                    />
                    <span
                        v-if="!collapsed"
                        :class="navLabelClass"
                    >{{ item.name }}</span>
                </span>
            </RouterLink>

            <span
                :class="navItemClasses(isSearchOpen)"
                :title="t('menu.search')"
                @click="openSearch"
            >
                <component
                    :is="
                        isSearchOpen
                            ? navigationItems[navigationItems.length - 1].selectedIcon
                            : navigationItems[navigationItems.length - 1].defaultIcon
                    "
                    :class="navIconClass"
                    aria-hidden="true"
                />
                <span
                    v-if="!collapsed"
                    :class="navLabelClass"
                >{{ t("menu.search") }}</span>
            </span>

            <RouterLink
                :to="{ name: 'bookmarks' }"
                v-slot="{ isActive, navigate }"
                custom
            >
                <span
                    :class="navItemClasses(isActive)"
                    :title="t('profile_menu.bookmarks')"
                    @click="navigate"
                >
                    <component
                        :is="isActive ? FilledBookmarkIcon : BookmarkIcon"
                        :class="navIconClass"
                        aria-hidden="true"
                    />
                    <span
                        v-if="!collapsed"
                        :class="navLabelClass"
                    >{{ t("profile_menu.bookmarks") }}</span>
                </span>
            </RouterLink>

            <div
                class="mt-2 border-t border-zinc-200 pt-3 dark:border-slate-700"
                :class="collapsed ? 'mx-0' : ''"
            >
                <span
                    :class="navItemClasses(false)"
                    :title="t('profile_menu.theme')"
                    @click="showThemeSelector = true"
                >
                    <SunIcon
                        :class="navIconClass"
                        aria-hidden="true"
                    />
                    <span
                        v-if="!collapsed"
                        :class="navLabelClass"
                    >{{ t("profile_menu.theme") }}</span>
                </span>

                <span
                    :class="navItemClasses(false)"
                    :title="languageTooltip"
                    @click="showLanguageModal = true"
                >
                    <LanguageIcon
                        :class="navIconClass"
                        aria-hidden="true"
                    />
                    <div
                        v-if="!collapsed"
                        class="min-w-0 flex flex-col leading-none"
                    >
                        <span :class="navLabelClass">{{ t("profile_menu.language") }}</span>
                        <span
                            v-if="appLanguageAsRef?.name"
                            :class="navMetaClass"
                        >{{ appLanguageAsRef.name }}</span>
                    </div>
                </span>

                <RouterLink
                    :to="{ name: 'settings' }"
                    v-slot="{ isActive, navigate }"
                    custom
                >
                    <span
                        :class="navItemClasses(isActive)"
                        :title="t('profile_menu.settings')"
                        @click="navigate"
                    >
                        <component
                            :is="isActive ? FilledCog6ToothIcon : Cog6ToothIcon"
                            :class="navIconClass"
                            aria-hidden="true"
                        />
                        <span
                            v-if="!collapsed"
                            :class="navLabelClass"
                        >{{ t("profile_menu.settings") }}</span>
                    </span>
                </RouterLink>
            </div>
        </div>

        <!-- Account -->
        <div
            class="border-t border-zinc-200 py-3 dark:border-slate-700"
            :class="collapsed ? 'px-2' : 'px-3'"
        >
            <button
                type="button"
                :class="actionButtonClasses()"
                :title="t('profile_menu.privacy_policy')"
                @click="showPrivacyPolicyModal = true"
            >
                <ShieldCheckIcon
                    :class="navIconClass"
                    aria-hidden="true"
                />
                <span
                    v-if="!collapsed"
                    :class="navLabelClass"
                >{{ t("profile_menu.privacy_policy") }}</span>
            </button>

            <button
                type="button"
                :class="[...actionButtonClasses(), !collapsed ? 'mb-2' : 'mb-1']"
                :title="isAuthenticated ? t('profile_menu.logout') : t('profile_menu.login')"
                @click="isAuthenticated ? handleLogout() : handleLogin()"
            >
                <component
                    :is="isAuthenticated ? ArrowRightEndOnRectangleIcon : ArrowLeftEndOnRectangleIcon"
                    :class="navIconClass"
                    aria-hidden="true"
                />
                <span
                    v-if="!collapsed"
                    :class="navLabelClass"
                >
                    {{ isAuthenticated ? t("profile_menu.logout") : t("profile_menu.login") }}
                </span>
            </button>

            <div
                v-if="isAuthenticated"
                :class="[
                    'flex items-center rounded-md',
                    collapsed ? 'justify-center px-0 py-1' : 'gap-3 pl-1.5 py-1.5',
                ]"
                :title="profileTooltip"
            >
                <img
                    v-if="user?.picture"
                    class="h-8 w-8 flex-shrink-0 rounded-full bg-slate-50"
                    :src="user.picture"
                    alt=""
                />
                <div
                    v-else
                    class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-300 dark:bg-slate-600"
                >
                    <UserIcon class="h-5 w-5 text-zinc-600 dark:text-slate-100" />
                </div>
                <span
                    v-if="!collapsed"
                    class="min-w-0 flex-1 truncate text-sm font-medium text-zinc-700 dark:text-slate-100"
                >
                    {{ user?.name || user?.email }}
                </span>
            </div>
        </div>
    </nav>

    <!-- Client-only: these overlays are interactive (and LanguageModal is
         Dexie-backed), so they must not render during the Node prerender. -->
    <template v-if="isMounted">
        <ThemeSelectorModal
            :isVisible="showThemeSelector"
            @close="showThemeSelector = false"
        />
        <LanguageModal
            :isVisible="showLanguageModal"
            @close="showLanguageModal = false"
        />
        <LDialog
            v-model:open="showLogoutDialog"
            :title="t('logout.modal.title')"
            :description="t('logout.modal.description')"
            :primaryAction="confirmLogout"
            :primaryButtonText="t('logout.modal.button_logout')"
            :secondaryAction="() => (showLogoutDialog = false)"
            :secondaryButtonText="t('logout.modal.button_cancel')"
        />
    </template>
</template>
