<script setup lang="ts">
import GhostPlaceholder from "../common/GhostPlaceholder.vue";

withDefaults(defineProps<{ count?: number }>(), { count: 5 });
</script>

<template>
    <!-- Mirrors ReadMore's list/grid and card box so swapping in the real cards doesn't shift layout. -->
    <ul
        aria-busy="true"
        data-test="read-more-ghost"
        class="flex flex-col gap-3 px-4 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-6 sm:px-8 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    >
        <li
            v-for="i in count"
            :key="i"
            class="flex gap-2 overflow-hidden rounded-lg bg-white shadow ring-1 ring-zinc-950/10 dark:bg-slate-800 dark:ring-white/10 sm:flex-col sm:gap-1"
        >
            <GhostPlaceholder class="aspect-[4/3] w-28 shrink-0 !rounded-none sm:w-full" />
            <div class="flex flex-1 flex-col gap-2 p-2 pl-0 sm:px-2 sm:pb-2 sm:pt-1">
                <GhostPlaceholder class="h-4 w-3/4" />
                <GhostPlaceholder class="h-3 w-full" />
                <GhostPlaceholder class="h-3 w-1/2" />
            </div>
        </li>
    </ul>
</template>
