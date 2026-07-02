<script setup lang="ts">
type Props = {
    label?: string;
};
defineProps<Props>();
</script>

<template>
    <div class="flex w-full flex-col items-center gap-4">
        <div class="text-2xl font-semibold text-zinc-300 dark:text-slate-100 max-lg:text-xl">
            {{ label ? label : 'Loading...' }}
        </div>
        <div
            class="relative h-3 w-4/5 max-w-md overflow-hidden rounded-full bg-zinc-200 dark:bg-slate-500"
        >
            <div
                class="absolute bottom-0 top-0 w-2/5 animate-running-slug rounded-full bg-zinc-400 dark:bg-slate-400"
            ></div>
        </div>
    </div>
</template>
