<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { getNavigationItems } from "./navigationItems";
import { useSearchOverlay } from "@/composables/useSearchOverlay";
import ProfileMenu from "./ProfileMenu.vue";
import defaultLogo from "@/assets/logo.svg?url";
import defaultLogoDark from "@/assets/logo-dark.svg?url";

const { t } = useI18n();
const { openSearch, isSearchOpen } = useSearchOverlay();

const LOGO = import.meta.env.VITE_LOGO || defaultLogo;
const LOGO_DARK = import.meta.env.VITE_LOGO_DARK || defaultLogoDark;

const navigationItems = computed(() => getNavigationItems(t));

const isItemActive = (routeActive: boolean) => routeActive && !isSearchOpen.value;
</script>

<template>
    <nav
        class="hidden lg:flex w-64 flex-shrink-0 flex-col border-r border-zinc-200 bg-zinc-100 dark:border-slate-700 dark:bg-slate-800"
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

        <!-- Nav items -->
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
        </div>

        <!-- Profile at bottom -->
        <div class="border-t border-zinc-200 px-3 py-4 dark:border-slate-700">
            <ProfileMenu trigger="sidebar" />
        </div>
    </nav>
</template>
