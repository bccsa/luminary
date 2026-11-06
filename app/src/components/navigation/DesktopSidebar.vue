<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { getNavigationItems } from "./navigationItems";
import { useSearchOverlay } from "@/composables/useSearchOverlay";
import {
    HeartIcon,
    Cog6ToothIcon,
    SunIcon,
    LanguageIcon,
    ShieldCheckIcon,
    ChevronLeftIcon,
} from "@heroicons/vue/24/outline";
import {
    HeartIcon as FilledHeartIcon,
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
const route = useRoute();
const { openSearch, closeSearch, isSearchOpen } = useSearchOverlay();
const { user, logout, loginWithRedirect, isAuthenticated } = useAuthWithPrivacyPolicy();

const LOGO = import.meta.env.VITE_LOGO || defaultLogo;
const LOGO_DARK = import.meta.env.VITE_LOGO_DARK || defaultLogoDark;
const LOGO_SMALL = import.meta.env.VITE_LOGO_SMALL || defaultLogoSmall;
const LOGO_SMALL_DARK = import.meta.env.VITE_LOGO_SMALL_DARK || defaultLogoSmall;

const navigationItems = computed(() => getNavigationItems(t));

// Close the desktop search modal whenever the user navigates to another route.
watch(
    () => route.fullPath,
    () => {
        closeSearch();
    },
);

// Below lg, Search navigates to the dedicated /search page (covers the localized
// `search-<code>` routes too); it is active (highlighted) while on that page.
const isSearchActive = computed(
    () =>
        route.name === "search" ||
        (typeof route.name === "string" && route.name.startsWith("search-")),
);

const isItemActive = (routeActive: boolean) =>
    routeActive && !isSearchOpen.value && !isSearchActive.value;

const showThemeSelector = ref(false);
const showLanguageModal = ref(false);
const showLogoutDialog = ref(false);
const forceReauthOnNextLogin = ref(true);

// The sidebar prerenders on the web/SSG build, but its interactive overlays (e.g. LanguageModal's Dexie-backed query) can't run during the Node prerender, so they mount client-side only.
const isMounted = useHydrated();

// Collapse state is the hidden checkbox inside the <nav> (checked = collapsed). The <nav> is
// `group/sb`, so every `group-has-[:checked]/sb:` class below applies only while it is collapsed.
// Below lg, collapsing slides the whole sidebar away (the <nav> goes to w-0) and nothing inside
// changes shape; from lg up it collapses to an icon rail, hence the `lg:` prefix on every
// collapsed-state class that reshapes the content. Class strings are written out in full so
// Tailwind can see them.
const navIconClass = "h-5 w-5 flex-shrink-0";
const navLabelClass = "truncate text-sm font-medium lg:group-has-[:checked]/sb:hidden";
const navMetaClass = "mt-0.5 truncate text-xs text-zinc-500 dark:text-slate-300";

// Shared row layout: left-aligned with a label when expanded, centred icon-only in the lg rail.
const itemLayoutClass =
    "cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 lg:group-has-[:checked]/sb:justify-center lg:group-has-[:checked]/sb:p-2.5";

function navItemClasses(active: boolean, display = "flex") {
    return [
        display,
        "mb-1 hover:bg-zinc-200 dark:hover:bg-slate-700",
        itemLayoutClass,
        active ? "text-yellow-700 dark:text-yellow-400" : "text-zinc-600 dark:text-slate-100",
    ];
}

function actionButtonClasses(last = false) {
    return [
        "flex w-full text-left text-zinc-600 hover:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-700",
        last ? "mb-2 lg:group-has-[:checked]/sb:mb-1" : "mb-1",
        itemLayoutClass,
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
    <!-- Below lg: a fixed overlay on the right edge, from the top down to the bottom menu
         (--mobile-menu-h). It is out of the page layout, so expanding or collapsing it never
         squeezes the content (or the search overlay) underneath; it simply sits above it. From lg
         up: back in the layout as the left sidebar. Side, visibility and collapse state are all
         Tailwind variants, with no JavaScript. Collapsed below lg the nav shrinks to w-0 (leaving
         only the toggle button on the screen edge); from lg up it shrinks to the icon rail. -->
    <nav
        class="group/sb fixed bottom-[var(--mobile-menu-h,0px)] right-0 top-0 z-40 flex w-64 flex-shrink-0 flex-col border-l border-zinc-200 bg-zinc-100 pr-[env(safe-area-inset-right,0px)] transition-[width] duration-200 ease-out has-[:checked]:w-0 has-[:checked]:border-l-0 has-[:checked]:pr-0 dark:border-slate-700 dark:bg-slate-800 lg:relative lg:bottom-auto lg:right-auto lg:top-auto lg:z-auto lg:order-first lg:border-l-0 lg:border-r lg:pr-0 lg:has-[:checked]:w-[4.5rem]"
    >
        <!-- Collapse state — a hidden checkbox (checked = collapsed). It is the only checkbox in
             this nav, so `has-[:checked]` / `group-has-[:checked]` read it directly. -->
        <input
            id="desktop-sidebar-collapsed"
            type="checkbox"
            class="peer sr-only"
            aria-label="Collapse sidebar"
        />

        <!-- Collapse toggle. Expanded, it sits on the sidebar's inner edge (left edge on small
             screens, right edge from lg up), vertically centred. Collapsed below lg, the sidebar
             is gone and the button hovers against the right edge of the screen (shifted left by
             its own width plus the right safe-area inset); from lg up it stays on the rail's edge. -->
        <label
            for="desktop-sidebar-collapsed"
            class="absolute left-0 top-1/2 z-20 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-600 shadow-md transition duration-200 hover:bg-zinc-50 hover:text-zinc-800 peer-focus-visible:ring-2 peer-focus-visible:ring-yellow-500 group-has-[:checked]/sb:translate-x-[calc(-100%-env(safe-area-inset-right,0px))] dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 dark:hover:text-slate-100 lg:left-auto lg:right-0 lg:translate-x-1/2 lg:group-has-[:checked]/sb:translate-x-1/2"
        >
            <!-- Below lg the sidebar is on the right: expanded, the arrow points right (slide away);
                 collapsed, it points left (bring it back). From lg up it is the other way round. -->
            <ChevronLeftIcon
                class="h-4 w-4 rotate-180 transition-transform duration-200 group-has-[:checked]/sb:rotate-0 lg:rotate-0 lg:group-has-[:checked]/sb:rotate-180"
                aria-hidden="true"
            />
        </label>

        <!-- Clipping wrapper: right-aligned, so as the nav shrinks the fixed-width panel inside
             slides off the right edge instead of squashing. Hidden (and so untabbable) once the
             slide has finished; the toggle above lives outside it so it is never clipped. -->
        <div
            class="flex min-h-0 flex-1 justify-end overflow-hidden transition-[visibility] duration-200 group-has-[:checked]/sb:invisible lg:group-has-[:checked]/sb:visible"
        >
            <div class="flex min-h-0 w-64 flex-shrink-0 flex-col lg:w-full lg:flex-shrink">
                <!-- Logo (lg and up only) — outer padding mirrors the nav container; inner padding mirrors a nav item -->
                <div class="hidden px-3 py-2 lg:block lg:group-has-[:checked]/sb:px-2">
                    <RouterLink
                        :to="{ name: 'home' }"
                        class="flex items-center px-3 py-2 lg:group-has-[:checked]/sb:justify-center"
                        :title="t('menu.home')"
                    >
                        <span class="flex items-center lg:group-has-[:checked]/sb:hidden">
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
                        </span>
                        <span class="hidden lg:group-has-[:checked]/sb:flex">
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
                        </span>
                    </RouterLink>
                </div>

                <!-- Nav -->
                <div
                    class="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 scrollbar-hide lg:group-has-[:checked]/sb:px-2"
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
                            <span :class="navLabelClass">{{ item.name }}</span>
                        </a>
                    </RouterLink>

                    <!-- Search, below lg: navigates to the dedicated /search page -->
                    <RouterLink
                        :to="{ name: 'search' }"
                        v-slot="{ href, navigate }"
                        custom
                    >
                        <a
                            :href="href"
                            :class="navItemClasses(isSearchActive, 'flex lg:hidden')"
                            :title="t('menu.search')"
                            @click="navigate"
                        >
                            <component
                                :is="
                                    isSearchActive
                                        ? navigationItems[navigationItems.length - 1].selectedIcon
                                        : navigationItems[navigationItems.length - 1].defaultIcon
                                "
                                :class="navIconClass"
                                aria-hidden="true"
                            />
                            <span :class="navLabelClass">{{ t("menu.search") }}</span>
                        </a>
                    </RouterLink>

                    <!-- Search, lg and up: opens the search overlay -->
                    <span
                        :class="navItemClasses(isSearchOpen, 'hidden lg:flex')"
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
                        <span :class="navLabelClass">{{ t("menu.search") }}</span>
                    </span>

                    <RouterLink
                        :to="{ name: 'activity' }"
                        v-slot="{ isActive, href, navigate }"
                        custom
                    >
                        <a
                            :href="href"
                            :class="navItemClasses(isActive)"
                            :title="t('profile_menu.activity')"
                            @click="navigate"
                        >
                            <component
                                :is="isActive ? FilledHeartIcon : HeartIcon"
                                :class="navIconClass"
                                aria-hidden="true"
                            />
                            <span :class="navLabelClass">{{ t("profile_menu.activity") }}</span>
                        </a>
                    </RouterLink>

                    <div class="mt-2 border-t border-zinc-200 pt-3 dark:border-slate-700">
                        <span
                            :class="navItemClasses(false)"
                            :title="t('profile_menu.theme')"
                            @click="showThemeSelector = true"
                        >
                            <SunIcon
                                :class="navIconClass"
                                aria-hidden="true"
                            />
                            <span :class="navLabelClass">{{ t("profile_menu.theme") }}</span>
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
                                class="flex min-w-0 flex-col leading-none lg:group-has-[:checked]/sb:hidden"
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
                                <span :class="navLabelClass">{{ t("profile_menu.settings") }}</span>
                            </a>
                        </RouterLink>
                    </div>
                </div>

                <!-- Account. Below lg the sidebar overlay stops at the top of the bottom menu, so it
                     needs no extra bottom padding to clear it. -->
                <div
                    class="border-t border-zinc-200 px-3 py-3 dark:border-slate-700 lg:group-has-[:checked]/sb:px-2"
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
                        <span :class="navLabelClass">{{ t("profile_menu.privacy_policy") }}</span>
                    </button>

                    <button
                        type="button"
                        :class="actionButtonClasses(true)"
                        :title="
                            isAuthenticated ? t('profile_menu.logout') : t('profile_menu.login')
                        "
                        @click="isAuthenticated ? handleLogout() : handleLogin()"
                    >
                        <component
                            :is="
                                isAuthenticated
                                    ? ArrowRightEndOnRectangleIcon
                                    : ArrowLeftEndOnRectangleIcon
                            "
                            :class="navIconClass"
                            aria-hidden="true"
                        />
                        <span :class="navLabelClass">
                            {{
                                isAuthenticated ? t("profile_menu.logout") : t("profile_menu.login")
                            }}
                        </span>
                    </button>

                    <div
                        v-if="isAuthenticated"
                        class="flex items-center gap-3 rounded-md py-1.5 pl-1.5 lg:group-has-[:checked]/sb:justify-center lg:group-has-[:checked]/sb:gap-0 lg:group-has-[:checked]/sb:px-0 lg:group-has-[:checked]/sb:py-1"
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
                            class="min-w-0 flex-1 truncate text-sm font-medium text-zinc-700 dark:text-slate-100 lg:group-has-[:checked]/sb:hidden"
                        >
                            {{ user?.name || user?.email }}
                        </span>
                    </div>
                </div>
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
