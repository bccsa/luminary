<script setup lang="ts">
import { commonNavigation } from "./navigationItems";
</script>

<template>
    <nav>
        <RouterLink
            v-for="item in commonNavigation"
            :key="item.name"
            :to="item.to"
            v-slot="{ isActive }"
            class="flex w-auto cursor-pointer rounded-md px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-600 lg:flex"
        >
            <span class="flex items-center justify-center gap-1.5">
                <component
                    :is="isActive ? item.selectedIcon : item.defaultIcon"
                    :class="[
                        'h-6 w-6 flex-shrink-0 ',
                        { 'text-zinc-400 dark:text-slate-200': !isActive },
                        { 'text-yellow-600 dark:text-yellow-400': isActive },
                    ]"
                    aria-hidden="true"
                />
                <span
                    :class="[
                        { 'text-zinc-800 dark:text-slate-100': !isActive },
                        { 'text-yellow-700 dark:text-yellow-500': isActive },
                    ]"
                >
                    {{ item.name }}
                </span>
            </span>
        </RouterLink>
    </nav>
</template>
