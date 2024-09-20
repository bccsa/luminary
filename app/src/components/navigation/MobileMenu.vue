<script setup lang="ts">
import { commonNavigation } from "./navigationItems";
</script>
<template>
    <div
        class="flex flex-row justify-center gap-4 border-t border-zinc-100 bg-zinc-50 py-3 dark:border-zinc-600 dark:bg-zinc-700"
    >
        <RouterLink
            v-for="item in commonNavigation"
            :key="item.name"
            :to="item.to"
            v-slot="{ isActive }"
            class="flex cursor-pointer flex-col items-center rounded-md px-2 py-1"
        >
            <component
                :is="isActive ? item.selectedIcon : item.defaultIcon"
                :class="[
                    'h-6 w-6',
                    { 'text-zinc-400 dark:text-zinc-200': !isActive },
                    { 'text-yellow-600 dark:text-yellow-400': isActive },
                ]"
            />
            <span
                :class="[
                    'text-sm font-medium',
                    { 'text-zinc-600 dark:text-zinc-100': !isActive },
                    { 'text-yellow-700 dark:text-yellow-500': isActive },
                ]"
            >
                {{ item.name }}
            </span>
        </RouterLink>
    </div>
</template>
