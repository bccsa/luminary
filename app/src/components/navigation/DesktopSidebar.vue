<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { getNavigationItems } from "./navigationItems";
import { useSearchOverlay } from "@/composables/useSearchOverlay";
import { BookmarkIcon, Cog6ToothIcon, SunIcon, LanguageIcon, ShieldCheckIcon } from "@heroicons/vue/24/outline";
import {
    BookmarkIcon as FilledBookmarkIcon,
    Cog6ToothIcon as FilledCog6ToothIcon,
    UserIcon,
    ArrowRightEndOnRectangleIcon,
    ArrowLeftEndOnRectangleIcon,
} from "@heroicons/vue/24/solid";
import defaultLogo from "@/assets/logo.svg?url";
import defaultLogoDark from "@/assets/logo-dark.svg?url";
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
const { user, logout, loginWithRedirect, isAuthenticated } = useAuthWithPrivacyPolicy();

const LOGO = import.meta.env.VITE_LOGO || defaultLogo;
const LOGO_DARK = import.meta.env.VITE_LOGO_DARK || defaultLogoDark;

const navigationItems = computed(() => getNavigationItems(t));

const isItemActive = (routeActive: boolean) => routeActive && !isSearchOpen.value;

const showThemeSelector = ref(false);
const showLanguageModal = ref(false);
const showLogoutDialog = ref(false);

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
        class="hidden w-64 flex-shrink-0 flex-col border-r border-zinc-200 bg-zinc-100 dark:border-slate-700 dark:bg-slate-800 lg:flex"
    >
        <!-- Logo -->
        <div class="px-6 py-5">
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
        </div>

        <!-- Primary nav items -->
        <div class="flex-1 overflow-y-auto px-3 py-2">
            <RouterLink
                v-for="item in navigationItems.slice(0, -1)"
                :key="item.name"
                :to="item.to"
                v-slot="{ isActive, navigate }"
                custom
            >
                <span
                    class="mb-1 flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 hover:bg-zinc-200 dark:hover:bg-slate-700"
                    :class="
                        isItemActive(isActive)
                            ? 'text-yellow-700 dark:text-yellow-400'
                            : 'text-zinc-600 dark:text-slate-100'
                    "
                    @click="navigate"
                >
                    <component
                        :is="isItemActive(isActive) ? item.selectedIcon : item.defaultIcon"
                        class="h-5 w-5 flex-shrink-0"
                        aria-hidden="true"
                    />
                    <span class="text-sm font-medium">{{ item.name }}</span>
                </span>
            </RouterLink>

            <!-- Search (opens overlay) -->
            <span
                class="mb-1 flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 hover:bg-zinc-200 dark:hover:bg-slate-700"
                :class="
                    isSearchOpen
                        ? 'text-yellow-700 dark:text-yellow-400'
                        : 'text-zinc-600 dark:text-slate-100'
                "
                @click="openSearch"
            >
                <component
                    :is="
                        isSearchOpen
                            ? navigationItems[navigationItems.length - 1].selectedIcon
                            : navigationItems[navigationItems.length - 1].defaultIcon
                    "
                    class="h-5 w-5 flex-shrink-0"
                    aria-hidden="true"
                />
                <span class="text-sm font-medium">{{ t("menu.search") }}</span>
            </span>

            <!-- Bookmarks -->
            <RouterLink
                :to="{ name: 'bookmarks' }"
                v-slot="{ isActive, navigate }"
                custom
            >
                <span
                    class="mb-1 flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 hover:bg-zinc-200 dark:hover:bg-slate-700"
                    :class="
                        isActive
                            ? 'text-yellow-700 dark:text-yellow-400'
                            : 'text-zinc-600 dark:text-slate-100'
                    "
                    @click="navigate"
                >
                    <component
                        :is="isActive ? FilledBookmarkIcon : BookmarkIcon"
                        class="h-5 w-5 flex-shrink-0"
                        aria-hidden="true"
                    />
                    <span class="text-sm font-medium">{{ t("profile_menu.bookmarks") }}</span>
                </span>
            </RouterLink>

            <!-- Theme -->
            <span
                class="mb-1 flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-zinc-600 hover:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-700"
                @click="showThemeSelector = true"
            >
                <SunIcon class="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                <span class="text-sm font-medium">{{ t("profile_menu.theme") }}</span>
            </span>

            <!-- Language -->
            <span
                class="mb-1 flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-zinc-600 hover:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-700"
                @click="showLanguageModal = true"
            >
                <LanguageIcon class="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                <div class="flex flex-col leading-none">
                    <span class="text-sm font-medium">{{ t("profile_menu.language") }}</span>
                    <span
                        v-if="appLanguageAsRef?.name"
                        class="mt-0.5 text-xs text-zinc-500 dark:text-slate-300"
                    >{{ appLanguageAsRef.name }}</span>
                </div>
            </span>

            <!-- Privacy Policy -->
            <span
                class="mb-1 flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-zinc-600 hover:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-700"
                @click="showPrivacyPolicyModal = true"
            >
                <ShieldCheckIcon class="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                <span class="text-sm font-medium">{{ t("profile_menu.privacy_policy") }}</span>
            </span>

            <!-- Settings -->
            <RouterLink
                :to="{ name: 'settings' }"
                v-slot="{ isActive, navigate }"
                custom
            >
                <span
                    class="mb-1 flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 hover:bg-zinc-200 dark:hover:bg-slate-700"
                    :class="
                        isActive
                            ? 'text-yellow-700 dark:text-yellow-400'
                            : 'text-zinc-600 dark:text-slate-100'
                    "
                    @click="navigate"
                >
                    <component
                        :is="isActive ? FilledCog6ToothIcon : Cog6ToothIcon"
                        class="h-5 w-5 flex-shrink-0"
                        aria-hidden="true"
                    />
                    <span class="text-sm font-medium">{{ t("profile_menu.settings") }}</span>
                </span>
            </RouterLink>
        </div>

        <!-- Bottom section: Logout + Profile -->
        <div class="border-t border-zinc-200 px-3 py-3 dark:border-slate-700">
            <!-- Logout / Login -->
            <span
                class="mb-2 flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-zinc-600 hover:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-700"
                @click="isAuthenticated ? handleLogout() : handleLogin()"
            >
                <component
                    :is="isAuthenticated ? ArrowRightEndOnRectangleIcon : ArrowLeftEndOnRectangleIcon"
                    class="h-5 w-5 flex-shrink-0"
                    aria-hidden="true"
                />
                <span class="text-sm font-medium">
                    {{ isAuthenticated ? t("profile_menu.logout") : t("profile_menu.login") }}
                </span>
            </span>

            <!-- Profile display -->
            <div
                v-if="isAuthenticated"
                class="flex items-center gap-3 rounded-md px-3 py-1.5"
            >
                <img
                    v-if="isAuthenticated && user?.picture"
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
                <span class="flex-1 truncate text-sm font-medium text-zinc-700 dark:text-slate-100">
                    {{ isAuthenticated ? user?.name || user?.email : t("profile_menu.title") }}
                </span>
            </div>
        </div>
    </nav>

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
