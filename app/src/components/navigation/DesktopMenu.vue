<script setup lang="ts">
import { getNavigationItems } from "./navigationItems";
import { useSearchOverlay } from "@/composables/useSearchOverlay";
import { useI18n } from "vue-i18n";

// Use global search overlay
const { openSearch } = useSearchOverlay();

const { t } = useI18n();

const handleSearchClick = () => {
    openSearch();
};
</script>

<template>
    <nav class="flex items-center gap-4">
        <RouterLink
            v-for="item in getNavigationItems()"
            :key="item.name"
            :to="item.to"
            v-slot="{ isActive, navigate }"
            custom
        >
            <span
                v-if="item.name === t('menu.search')"
                @click="handleSearchClick"
                class="flex cursor-pointer rounded-md px-2 py-1 hover:bg-zinc-200 dark:hover:bg-slate-700"
            >
                <span class="flex items-center justify-center gap-1.5">
                    <component
                        :is="item.defaultIcon"
                        class="h-6 w-6 flex-shrink-0 text-zinc-400 dark:text-slate-200"
                        aria-hidden="true"
                    />
                    <span class="text-zinc-600 dark:text-slate-100">
                        {{ item.name }}
                    </span>
                </span>
            </span>
            <span
                v-else
                @click="navigate"
                class="flex cursor-pointer rounded-md px-2 py-1 hover:bg-zinc-200 dark:hover:bg-slate-700"
            >
                <span class="flex items-center justify-center gap-1.5">
                    <component
                        :is="isActive ? item.selectedIcon : item.defaultIcon"
                        :class="[
                            'h-6 w-6 flex-shrink-0 ',
                            { 'text-zinc-400 dark:text-slate-200': !isActive },
                            { 'text-yellow-600 dark:text-yellow-500': isActive },
                        ]"
                        aria-hidden="true"
                    />
                    <span
                        :class="[
                            { 'text-zinc-600 dark:text-slate-100': !isActive },
                            { 'text-yellow-700 dark:text-yellow-400': isActive },
                        ]"
                    >
                        {{ item.name }}
                    </span>
                </span>
            </span>
        </RouterLink>
    </nav>
</template>
