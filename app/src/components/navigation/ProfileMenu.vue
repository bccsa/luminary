<script setup lang="ts">
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/vue";
import {
    ChevronDownIcon,
    UserIcon,
    ArrowRightEndOnRectangleIcon,
    ArrowLeftEndOnRectangleIcon,
    Cog6ToothIcon,
} from "@heroicons/vue/20/solid";
import ThemeSelectorModal from "./ThemeSelectorModal.vue";
import { useAuth0 } from "@auth0/auth0-vue";
import { useRouter } from "vue-router";
import { computed, ref } from "vue";
import { LanguageIcon, SunIcon } from "@heroicons/vue/24/solid";
import LanguageModal from "@/components/navigation/LanguageModal.vue";
import { appLanguageAsRef } from "@/globalConfig";
import { BookmarkIcon } from "@heroicons/vue/16/solid";

const { user, logout, isAuthenticated } = useAuth0();
const router = useRouter();

const showThemeSelector = ref(false);
const showLanguageModal = ref(false);

const commonNavigation = computed(() => {
    return [
        {
            name: "Settings",
            icon: Cog6ToothIcon,
            action: () => router.push({ name: "settings" }),
        },
        { name: "Theme", icon: SunIcon, action: () => (showThemeSelector.value = true) },
        {
            name: "Language",
            language: appLanguageAsRef.value,
            icon: LanguageIcon,
            action: () => (showLanguageModal.value = true),
        },
        {
            name: "Bookmarks",
            icon: BookmarkIcon,
            action: () => router.push({ name: "bookmarks" }),
        },
    ];
});

const userNavigation = computed(() => {
    if (isAuthenticated.value) {
        return [
            ...commonNavigation.value,

            {
                name: "Log out",
                icon: ArrowRightEndOnRectangleIcon,
                action: async () => {
                    localStorage.removeItem("usedAuth0Connection");
                    await logout({ logoutParams: { returnTo: window.location.origin } });
                },
            },
        ];
    } else {
        return [
            ...commonNavigation.value,

            {
                name: "Log In",
                icon: ArrowLeftEndOnRectangleIcon,
                action: () => router.push({ name: "login" }),
            },
        ];
    }
});
</script>

<template>
    <Menu as="div" class="relative z-50">
        <MenuButton name="profile-menu-btn" class="-m-1.5 flex items-center p-1.5">
            <span class="sr-only">Open user menu</span>
            <img
                class="h-8 w-8 rounded-full bg-slate-50"
                :src="user?.picture"
                v-if="isAuthenticated && user?.picture"
                alt=""
            />
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-300" v-else>
                <UserIcon class="h-6 w-6 text-zinc-600 dark:text-slate-100" />
            </div>
            <span class="hidden lg:flex lg:items-center">
                <span
                    class="ml-4 whitespace-nowrap text-sm font-semibold leading-6 text-zinc-900 dark:text-slate-50"
                    aria-hidden="true"
                    v-if="isAuthenticated"
                    >{{ user?.name }}</span
                >
                <span
                    class="ml-2 text-sm font-semibold leading-6 text-zinc-900 dark:text-slate-50"
                    aria-hidden="true"
                    v-else
                    >Menu</span
                >
                <ChevronDownIcon
                    class="h-5 w-5 text-zinc-400 dark:text-slate-100"
                    aria-hidden="true"
                />
            </span>
        </MenuButton>
        <!-- <transition
            enter-active-class="transition ease-out duration-100"
            enter-from-class="transform opacity-0 scale-95"
            enter-to-class="transform opacity-100 scale-100"
            leave-active-class="transition ease-in duration-75"
            leave-from-class="transform opacity-100 scale-100"
            leave-to-class="transform opacity-0 scale-95"
        > -->
        <MenuItems
            name="menu-items"
            class="absolute right-0 z-10 mb-10 mt-2.5 w-32 origin-top-right rounded-md bg-white py-2 shadow-lg ring-1 ring-zinc-900/5 focus:outline-none dark:bg-slate-700"
        >
            <MenuItem v-for="item in userNavigation" :key="item.name" v-slot="{ active }">
                <button
                    :class="[
                        active ? 'bg-zinc-50 dark:bg-slate-800' : '',
                        'flex w-full cursor-pointer items-center gap-2 px-3 py-1 text-left text-sm leading-6 text-zinc-900 dark:text-white dark:hover:bg-slate-600',
                    ]"
                    @click="item.action"
                >
                    <component
                        :is="item.icon"
                        class="h-5 w-5 flex-shrink-0 text-zinc-500 dark:text-slate-300"
                        aria-hidden="true"
                    />
                    <div class="flex flex-col">
                        {{ item.name }}
                        <span
                            class="-mt-2 text-[12px] text-zinc-500 dark:text-white"
                            v-if="item.language"
                            >{{ item.language.name }}</span
                        >
                    </div>
                </button>
            </MenuItem>
        </MenuItems>
        <!-- </transition> -->
    </Menu>
    <LanguageModal :is-visible="showLanguageModal" @close="showLanguageModal = false" />
    <ThemeSelectorModal :is-visible="showThemeSelector" @close="showThemeSelector = false" />
</template>
