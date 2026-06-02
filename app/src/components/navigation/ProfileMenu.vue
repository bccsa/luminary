<script setup lang="ts">
import {
    ChevronDownIcon,
    ChevronUpIcon,
    UserIcon,
    XMarkIcon,
    ArrowRightEndOnRectangleIcon,
    ArrowLeftEndOnRectangleIcon,
} from "@heroicons/vue/20/solid";
import { Bars3Icon as Bars3IconSolid } from "@heroicons/vue/24/solid";
import ThemeSelectorModal from "./ThemeSelectorModal.vue";
import { useRouter } from "vue-router";
import { computed, ref, type ComputedRef } from "vue";
import {
    ShieldCheckIcon,
    BookmarkIcon,
    Bars3Icon,
    Cog6ToothIcon,
    LanguageIcon,
    SunIcon,
} from "@heroicons/vue/24/outline";
import LanguageModal from "@/components/navigation/LanguageModal.vue";
import { appLanguageAsRef } from "@/globalConfig";
import {
    showPrivacyPolicyModal,
    useAuthWithPrivacyPolicy,
} from "@/composables/useAuthWithPrivacyPolicy";
import { useI18n } from "vue-i18n";
import { isConnected } from "luminary-shared";
import { useNotificationStore, type Notification } from "@/stores/notification";
import LDialog from "../common/LDialog.vue";
import MobileSidebar from "../common/MobileSidebar.vue";
import DropdownMenu from "../common/DropdownMenu.vue";
import { clearAuth0Cache } from "@/auth";

type Trigger = "avatar" | "bars" | "sidebar";
type Props = {
    trigger?: Trigger;
};

withDefaults(defineProps<Props>(), {
    trigger: "avatar",
});

const { user, logout, loginWithRedirect, isAuthenticated } = useAuthWithPrivacyPolicy();
const router = useRouter();

const showThemeSelector = ref(false);
const showLanguageModal = ref(false);
const showLogoutDialog = ref(false);
const menuOpen = ref(false);

const { t } = useI18n();
const menuLabel = computed(() => t("profile_menu.title"));

const showOfflineNotification = () => {
    useNotificationStore().addNotification({
        id: "no-internet-connection-logout",
        title: t("profile_menu.logout.offline_notification_title"),
        description: t("profile_menu.logout.offline_notification"),
        type: "toast",
        state: "error",
    } as Notification);
};

const confirmLogout = async () => {
    if (!isConnected.value) {
        showLogoutDialog.value = false;
        showOfflineNotification();
        return;
    }
    localStorage.removeItem("usedAuth0Connection");
    // Wipe local Auth0 footprint synchronously so that an interrupted
    // logout redirect doesn't leave stale provider state behind.
    clearAuth0Cache();
    await logout({ logoutParams: { returnTo: window.location.origin } });
};

type NavigationItems = {
    name: string;
    language?: string;
    icon: any;
    action: () => void;
};

const commonNavigation: ComputedRef<NavigationItems[]> = computed(() => {
    return [
        {
            name: t("profile_menu.settings"),
            icon: Cog6ToothIcon,
            action: () => router.push({ name: "settings" }),
        },
        {
            name: t("profile_menu.theme"),
            icon: SunIcon,
            action: () => (showThemeSelector.value = true),
        },
        {
            name: t("profile_menu.language"),
            language: appLanguageAsRef.value?.name,
            icon: LanguageIcon,
            action: (): void => {
                showLanguageModal.value = true;
            },
        },
        {
            name: t("profile_menu.bookmarks"),
            icon: BookmarkIcon,
            action: () => router.push({ name: "bookmarks" }),
        },
        {
            name: t("profile_menu.privacy_policy"),
            icon: ShieldCheckIcon,
            action: () => (showPrivacyPolicyModal.value = true),
        },
    ];
});

const userNavigation = computed(() => {
    if (isAuthenticated.value) {
        return [
            ...commonNavigation.value,

            {
                name: t("profile_menu.logout"),
                icon: ArrowRightEndOnRectangleIcon,
                action: () => {
                    if (isConnected.value) {
                        showLogoutDialog.value = true;
                        return;
                    }
                    showOfflineNotification();
                },
            },
        ];
    } else {
        return [
            ...commonNavigation.value,

            {
                name: t("profile_menu.login"),
                icon: ArrowLeftEndOnRectangleIcon,
                action: () => {
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
                },
            },
        ];
    }
});

const sidebarNavigation = computed(() =>
    userNavigation.value.filter(
        (item) =>
            item.name !== t("profile_menu.settings") && item.name !== t("profile_menu.bookmarks"),
    ),
);
</script>

<template>
    <!-- Trigger: avatar in the top-right (desktop account-menu convention) -->
    <button
        v-if="trigger === 'avatar'"
        type="button"
        name="profile-menu-btn"
        aria-label="Open user menu"
        class="-m-1.5 flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-zinc-200 dark:hover:bg-slate-600"
        @click="menuOpen = !menuOpen"
    >
        <img
            v-if="isAuthenticated && user?.picture"
            class="h-8 w-8 rounded-full bg-slate-50"
            :src="user.picture"
            alt=""
        />
        <div
            v-else
            class="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-300 dark:bg-slate-600"
        >
            <UserIcon class="h-5 w-5 text-zinc-600 dark:text-slate-100" />
        </div>
        <component
            :is="menuOpen ? ChevronUpIcon : ChevronDownIcon"
            class="h-5 w-5 text-zinc-400 dark:text-slate-100"
            aria-hidden="true"
        />
    </button>

    <!-- Trigger: sidebar row — avatar + name, full width, for the desktop left sidebar -->
    <DropdownMenu
        v-else-if="trigger === 'sidebar'"
        v-model:open="menuOpen"
        placement="top-start"
        class="w-full"
        panel-class="w-56"
    >
        <template #trigger>
            <div
                class="flex w-full items-center gap-3 rounded-md px-1 py-1.5 hover:bg-zinc-200 dark:hover:bg-slate-700"
                aria-label="Open user menu"
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
                <span
                    class="flex-1 truncate text-left text-sm font-medium text-zinc-700 dark:text-slate-100"
                >
                    {{ isAuthenticated ? user?.name || user?.email : t("profile_menu.title") }}
                </span>
                <component
                    :is="menuOpen ? ChevronUpIcon : ChevronDownIcon"
                    class="h-4 w-4 flex-shrink-0 text-zinc-400 dark:text-slate-400"
                    aria-hidden="true"
                />
            </div>
        </template>

        <div class="py-1">
            <button
                v-for="item in sidebarNavigation"
                :key="item.name"
                type="button"
                class="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm text-zinc-900 hover:bg-zinc-50 dark:text-white dark:hover:bg-slate-600"
                @click="
                    item.action();
                    menuOpen = false;
                "
            >
                <component
                    :is="item.icon"
                    class="h-5 w-5 flex-shrink-0 text-zinc-500 dark:text-slate-300"
                    aria-hidden="true"
                />
                <div class="flex flex-col leading-none">
                    {{ item.name }}
                    <span
                        v-if="'language' in item && item.language"
                        class="mt-1 text-xs text-zinc-500 dark:text-slate-300"
                    >
                        {{ item.language }}
                    </span>
                </div>
            </button>
        </div>
    </DropdownMenu>

    <!-- Trigger: bars + "Menu" tab on the mobile bottom bar (matches the other tabs) -->
    <button
        v-else
        type="button"
        name="profile-menu-btn"
        aria-label="Open user menu"
        class="flex flex-col items-center rounded-md px-2 py-1"
        @click="menuOpen = !menuOpen"
    >
        <component
            :is="menuOpen ? Bars3IconSolid : Bars3Icon"
            :class="[
                'h-6 w-6',
                menuOpen
                    ? 'text-yellow-600 dark:text-yellow-500'
                    : 'text-zinc-400 dark:text-slate-200',
            ]"
        />
        <span
            :class="[
                'text-sm font-medium',
                menuOpen
                    ? 'text-yellow-700 dark:text-yellow-400'
                    : 'text-zinc-600 dark:text-slate-100',
            ]"
        >
            {{ menuLabel }}
        </span>
    </button>

    <!-- Shared slide-in panel (avatar + bars triggers only) -->
    <MobileSidebar
        v-if="trigger !== 'sidebar'"
        v-model:open="menuOpen"
    >
        <template #header="{ close }">
            <header
                class="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-slate-600"
            >
                <img
                    v-if="isAuthenticated && user?.picture"
                    class="h-9 w-9 flex-shrink-0 rounded-full bg-slate-50"
                    :src="user.picture"
                    alt=""
                />
                <div
                    v-else
                    class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-zinc-300 dark:bg-slate-600"
                >
                    <UserIcon class="h-5 w-5 text-zinc-600 dark:text-slate-100" />
                </div>

                <div class="flex min-w-0 flex-1 flex-col leading-tight">
                    <span
                        class="truncate text-sm font-semibold text-zinc-900 dark:text-slate-50"
                        :title="isAuthenticated ? user?.name || user?.email : undefined"
                    >
                        {{ isAuthenticated ? user?.name || user?.email : menuLabel }}
                    </span>
                    <span
                        v-if="isAuthenticated && user?.email && user.email !== user.name"
                        class="mt-0.5 truncate text-xs text-zinc-500 dark:text-slate-300"
                        :title="user.email"
                    >
                        {{ user.email }}
                    </span>
                </div>

                <button
                    type="button"
                    @click="close"
                    class="flex-shrink-0 rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-slate-300 dark:hover:bg-slate-600 dark:hover:text-slate-100"
                    aria-label="Close menu"
                >
                    <XMarkIcon class="h-5 w-5" />
                </button>
            </header>
        </template>
        <template #default="{ close }">
            <div class="py-2">
                <button
                    v-for="item in userNavigation"
                    :key="item.name"
                    type="button"
                    class="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-sm text-zinc-900 hover:bg-zinc-50 dark:text-white dark:hover:bg-slate-600"
                    @click="
                        item.action();
                        close();
                    "
                >
                    <component
                        :is="item.icon"
                        class="h-5 w-5 flex-shrink-0 text-zinc-500 dark:text-slate-300"
                        aria-hidden="true"
                    />
                    <div class="flex flex-col leading-none">
                        {{ item.name }}
                        <span
                            v-if="'language' in item && item.language"
                            class="mt-1 text-xs text-zinc-500 dark:text-slate-300"
                            >{{ item.language }}</span
                        >
                    </div>
                </button>
            </div>
        </template>
    </MobileSidebar>

    <LanguageModal
        :isVisible="showLanguageModal"
        @close="showLanguageModal = false"
    />
    <ThemeSelectorModal
        :isVisible="showThemeSelector"
        @close="showThemeSelector = false"
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
