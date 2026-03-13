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

// Check if search is currently active (overlay is open)
const isSearchActive = computed(() => isSearchOpen.value);

// Store navigation items to avoid multiple function calls
const navigationItems = computed(() => getNavigationItems());

const handleSearchClick = () => {
    openSearch();
};
</script>

<template>
    <div class="flex flex-row justify-center gap-4 bg-zinc-100 py-3 dark:bg-slate-800">
        <!-- Navigation items in order: Home, Explore, Watch, Search -->
        <RouterLink
            v-for="item in navigationItems.slice(0, 3)"
            :key="item.name"
            :to="item.to"
            v-slot="{ isActive }"
            class="flex cursor-pointer flex-col items-center rounded-md px-2 py-1"
        >
            <component
                :is="isActive ? item.selectedIcon : item.defaultIcon"
                :class="[
                    'h-6 w-6',
                    { 'text-zinc-400 dark:text-slate-200': !isActive },
                    { 'text-yellow-600 dark:text-yellow-500': isActive },
                ]"
            />
            <span
                :class="[
                    'text-sm font-medium',
                    { 'text-zinc-600 dark:text-slate-100': !isActive },
                    { 'text-yellow-700 dark:text-yellow-400': isActive },
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
                        ? navigationItems[3].selectedIcon
                        : navigationItems[3].defaultIcon
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
