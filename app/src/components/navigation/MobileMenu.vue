<script setup lang="ts">
// import { commonNavigation } from "./navigationItems";
import { getNavigationItems } from "./navigationItems";
</script>
<template>
    <slot name="before"></slot>
    <div class="flex flex-row justify-center gap-4 bg-zinc-100 py-3 dark:bg-slate-800">
        <RouterLink
            v-for="item in getNavigationItems()"
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
    </div>
</template>
