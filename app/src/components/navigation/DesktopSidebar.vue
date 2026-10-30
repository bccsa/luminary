CSS only SideBar:

<script setup lang="ts">
import { computed, ref } from "vue";
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
import LToggle from "../form/LToggle.vue";
import { cmsLanguages } from "@/globalConfig";
import { useDisplayLanguageIds } from "@/ssg/renderLanguage";
import {
    showPrivacyPolicyModal,
    useAuthWithPrivacyPolicy,
} from "@/composables/useAuthWithPrivacyPolicy";
import { isConnected } from "luminary-shared";
import { useNotificationStore, type Notification } from "@/stores/notification";
import { useHydrated } from "@/composables/useHydrated";

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
const forceReauthOnNextLogin = ref(true);

// The sidebar prerenders on the web/SSG build, but its interactive overlays (e.g. LanguageModal's Dexie-backed query) can't run during the Node prerender, so they mount client-side only.
const isMounted = useHydrated();

// On small screens (below Tailwind's `lg` breakpoint) the sidebar stays on the left side of the
// screen (same as on desktop) and is loaded in its expanded state by default. It can still be
// collapsed and expanded with the toggle. When collapsed on small screens it is not
// shown at all (no icon-only rail like on desktop) — only the toggle button remains visible.
// The small-screen behaviour is driven purely by CSS breakpoints (`lg:` variants): there is no
// JavaScript viewport detection. `mobileOpen` only tracks the open/closed state on small screens
// and is independent from the desktop `collapsed` state, so resizing never resets or mixes them.
const mobileOpen = ref(true);
const toggleMobileOpen = () => {
    mobileOpen.value = !mobileOpen.value;
};

const navIconClass = "h-5 w-5 flex-shrink-0";
const navLabelClass = "truncate text-sm font-medium";
const navMetaClass = "mt-0.5 truncate text-xs text-zinc-500 dark:text-slate-300";

// Labels are always rendered and hidden with CSS on desktop only when the icon rail is collapsed,
// so they stay visible on small screens whenever the sidebar is open.
const labelVisibilityClass = computed(() => (collapsed.value ? "lg:hidden" : ""));

function navItemClasses(active: boolean) {
    return [
        "mb-1 flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 hover:bg-zinc-200 dark:hover:bg-slate-700",
        collapsed.value ? "lg:justify-center lg:p-2.5" : "",
        active ? "text-yellow-700 dark:text-yellow-400" : "text-zinc-600 dark:text-slate-100",
    ];
}

function actionButtonClasses() {
    return [
        "mb-1 flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-left text-zinc-600 hover:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-700",
        collapsed.value ? "lg:justify-center lg:p-2.5" : "",
    ];
}

// Resolved from the per-render language rather than the shared ref: this renders on every
// prerendered page, and concurrent renders overwrite the ref (see ssg/renderLanguage.ts).
const displayLanguageIds = useDisplayLanguageIds();
const renderLanguage = computed(() =>
    cmsLanguages.value.find((l) => l._id === displayLanguageIds()[0]),
);

const languageTooltip = computed(() => {
    const name = renderLanguage.value?.name;
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
    // Close now, not after logout(): a real IdP redirect unloads the page
    // anyway, and if the redirect fails the dialog shouldn't stay stuck open.
    showLogoutDialog.value = false;
    // logout() already clears local state in the right order — don't call
    // clearAuthCache() here first, or it turns logout() into a no-op.
    await logout({ forceReauthOnNextLogin: forceReauthOnNextLogin.value });
    forceReauthOnNextLogin.value = false;
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
        class="relative flex flex-shrink-0 flex-col border-zinc-200 bg-zinc-100 transition-[width] duration-200 ease-out dark:border-slate-700 dark:bg-slate-800 lg:border-r"
        :class="[
            mobileOpen ? 'w-64 border-r' : 'w-0 border-r-0',
            collapsed ? 'lg:w-[4.5rem]' : 'lg:w-64',
        ]"
    >
        <!-- Collapse toggle (small screens) — sits on the right edge of the sidebar when it is open, vertically centred. When the sidebar is closed it is not shown at all, so this button sits at the left edge of the screen and is the only thing visible. Hidden on large screens. -->
        <button
            type="button"
            class="absolute top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-600 shadow-md transition-colors hover:bg-zinc-50 hover:text-zinc-800 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 dark:hover:text-slate-100 lg:hidden"
            :class="mobileOpen ? 'right-0 translate-x-1/2' : 'left-1'"
            :aria-label="mobileOpen ? 'Collapse sidebar' : 'Expand sidebar'"
            @click="toggleMobileOpen"
        >
            <ChevronLeftIcon
                v-if="mobileOpen"
                class="h-4 w-4 -translate-x-0.5"
                aria-hidden="true"
            />
            <ChevronRightIcon
                v-else
                class="h-4 w-4 translate-x-0.5"
                aria-hidden="true"
            />
        </button>

        <!-- Collapse toggle (large screens) — sits on the inner edge (right edge), vertically centred. Hidden on small screens. -->
        <button
            type="button"
            class="absolute right-0 top-1/2 z-20 hidden h-8 w-8 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-600 shadow-md transition-colors hover:bg-zinc-50 hover:text-zinc-800 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 dark:hover:text-slate-100 lg:flex"
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

        <!-- Logo — outer padding mirrors the nav container; inner padding mirrors a nav item. Hidden on small screens. -->
        <div
            class="hidden lg:block"
            :class="collapsed ? 'px-2 py-2' : 'px-3 py-2'"
        >
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
            :class="[collapsed ? 'px-3 lg:px-2' : 'px-3', mobileOpen ? '' : 'hidden lg:block']"
        >
            <RouterLink
                v-for="item in navigationItems.slice(0, -1)"
                :key="item.name"
                :to="item.to"
                v-slot="{ isActive, href, navigate }"
                custom
            >
                <a
                    :href="href"
                    :class="navItemClasses(isItemActive(isActive))"
                    :title="item.name"
                    @click="navigate"
                >
                    <component
                        :is="isItemActive(isActive) ? item.selectedIcon : item.defaultIcon"
                        :class="navIconClass"
                        aria-hidden="true"
                    />
                    <span :class="[navLabelClass, labelVisibilityClass]">{{ item.name }}</span>
                </a>
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
                <span :class="[navLabelClass, labelVisibilityClass]">{{ t("menu.search") }}</span>
            </span>

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
                    <span :class="[navLabelClass, labelVisibilityClass]">{{
                        t("profile_menu.theme")
                    }}</span>
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
                        class="flex min-w-0 flex-col leading-none"
                        :class="labelVisibilityClass"
                    >
                        <span :class="navLabelClass">{{ t("profile_menu.language") }}</span>
                        <span
                            v-if="renderLanguage?.name"
                            :class="navMetaClass"
                            >{{ renderLanguage.name }}</span
                        >
                    </div>
                </span>

                <RouterLink
                    :to="{ name: 'settings' }"
                    v-slot="{ isActive, href, navigate }"
                    custom
                >
                    <a
                        :href="href"
                        :class="navItemClasses(isActive)"
                        :title="t('profile_menu.settings')"
                        @click="navigate"
                    >
                        <component
                            :is="isActive ? FilledCog6ToothIcon : Cog6ToothIcon"
                            :class="navIconClass"
                            aria-hidden="true"
                        />
                        <span :class="[navLabelClass, labelVisibilityClass]">{{
                            t("profile_menu.settings")
                        }}</span>
                    </a>
                </RouterLink>
            </div>
        </div>

        <!-- Account -->
        <div
            class="border-t border-zinc-200 py-3 dark:border-slate-700"
            :class="[collapsed ? 'px-3 lg:px-2' : 'px-3', mobileOpen ? '' : 'hidden lg:block']"
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
                <span :class="[navLabelClass, labelVisibilityClass]">{{
                    t("profile_menu.privacy_policy")
                }}</span>
            </button>

            <button
                type="button"
                :class="[...actionButtonClasses(), collapsed ? 'mb-2 lg:mb-1' : 'mb-2']"
                :title="isAuthenticated ? t('profile_menu.logout') : t('profile_menu.login')"
                @click="isAuthenticated ? handleLogout() : handleLogin()"
            >
                <component
                    :is="
                        isAuthenticated ? ArrowRightEndOnRectangleIcon : ArrowLeftEndOnRectangleIcon
                    "
                    :class="navIconClass"
                    aria-hidden="true"
                />
                <span :class="[navLabelClass, labelVisibilityClass]">
                    {{ isAuthenticated ? t("profile_menu.logout") : t("profile_menu.login") }}
                </span>
            </button>

            <div
                v-if="isAuthenticated"
                :class="[
                    'flex items-center gap-3 rounded-md py-1.5 pl-1.5',
                    collapsed ? 'lg:justify-center lg:px-0 lg:py-1' : '',
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
                    class="min-w-0 flex-1 truncate text-sm font-medium text-zinc-700 dark:text-slate-100"
                    :class="labelVisibilityClass"
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
        >
            <label
                class="mt-4 flex cursor-pointer items-start gap-3 rounded-lg bg-zinc-100/80 p-3 dark:bg-slate-800/40"
            >
                <LToggle
                    class="mt-0.5"
                    :modelValue="forceReauthOnNextLogin"
                    @update:modelValue="(value: boolean) => (forceReauthOnNextLogin = value)"
                    data-test="shared-device-toggle"
                />
                <span class="text-sm leading-snug">
                    <span class="block font-medium text-zinc-900 dark:text-white">
                        {{ t("logout.modal.force_global_logout_label") }}
                    </span>
                    <span class="mt-1 block text-xs text-zinc-500 dark:text-slate-300">
                        {{ t("logout.modal.force_global_logout_description") }}
                    </span>
                </span>
            </label>
        </LDialog>
    </template>
</template>
