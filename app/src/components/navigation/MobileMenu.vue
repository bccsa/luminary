<script setup lang="ts">
import { getNavigationItems } from "./navigationItems";
import { useSearchOverlay } from "@/composables/useSearchOverlay";
import { computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

// Use global search overlay
const { isSearchOpen, openSearch, closeSearch } = useSearchOverlay();

const { t } = useI18n();
const route = useRoute();

// Close search whenever the user navigates to another route
watch(() => route.fullPath, () => {
    closeSearch();
});

// Search tab is active (highlighted) when the overlay is open
const isSearchActive = computed(() => isSearchOpen.value);

// When search is open, only Search looks active; when closed, show the current route's tab as active
const isNavItemActive = (routeActive: boolean) => routeActive && !isSearchOpen.value;

// Store navigation items to avoid multiple function calls
const navigationItems = computed(() => getNavigationItems(t));

const handleSearchClick = () => {
    openSearch();
};
</script>

<template>
    <div class="flex flex-row justify-center gap-4 bg-zinc-100 py-3 dark:bg-slate-800">
        <!-- Navigation items in order: Home, Explore, Watch, Search -->
        <RouterLink
            v-for="item in navigationItems.slice(0, -1)"
            :key="item.name"
            :to="item.to"
            v-slot="{ isActive }"
            class="flex cursor-pointer flex-col items-center rounded-md px-2 py-1"
            @click="closeSearch"
        >
            <component
                :is="isNavItemActive(isActive) ? item.selectedIcon : item.defaultIcon"
                :class="[
                    'h-6 w-6',
                    { 'text-zinc-400 dark:text-slate-200': !isNavItemActive(isActive) },
                    { 'text-yellow-600 dark:text-yellow-500': isNavItemActive(isActive) },
                ]"
            />
            <span
                :class="[
                    'text-sm font-medium',
                    { 'text-zinc-600 dark:text-slate-100': !isNavItemActive(isActive) },
                    { 'text-yellow-700 dark:text-yellow-400': isNavItemActive(isActive) },
                ]"
            >
                {{ item.name }}
            </span>
        </RouterLink>

        <!-- Search item - opens overlay (last item) -->
        <div
            class="flex cursor-pointer flex-col items-center rounded-md px-2 py-1"
            @click="handleSearchClick"
        >
            <component
                :is="
                    isSearchActive
                        ? navigationItems[navigationItems.length - 1].selectedIcon
                        : navigationItems[navigationItems.length - 1].defaultIcon
                "
                :class="[
                    'h-6 w-6',
                    { 'text-zinc-400 dark:text-slate-200': !isSearchActive },
                    { 'text-yellow-600 dark:text-yellow-500': isSearchActive },
                ]"
            />
            <span
                :class="[
                    'text-sm font-medium',
                    { 'text-zinc-600 dark:text-slate-100': !isSearchActive },
                    { 'text-yellow-700 dark:text-yellow-400': isSearchActive },
                ]"
            >
                {{ t("menu.search") }}
            </span>
        </div>
    </div>
</template>
