<script setup lang="ts">
type Props = {
    label?: string;
};
defineProps<Props>();
</script>

<template>
<<<<<<< HEAD
    <div class="flex w-full flex-col items-center gap-4">
        <div class="text-2xl font-semibold text-zinc-500 dark:text-slate-400 max-lg:text-xl">
            {{ label }}
        </div>
        <div
            class="relative h-3 w-4/5 max-w-md overflow-hidden rounded-full bg-zinc-200 dark:bg-slate-700"
        >
            <div
                class="absolute bottom-0 top-0 w-2/5 animate-running-slug rounded-full bg-zinc-500 dark:bg-slate-400"
            ></div>
        </div>
=======
    <div class="relative h-3 w-1/2 overflow-hidden rounded-full bg-zinc-200 dark:bg-slate-700">
        <div
            class="animate-running-slug absolute bottom-0 top-0 w-2/5 rounded-full bg-zinc-500 dark:bg-slate-400"
        ></div>
>>>>>>> 9d765d06 (update loading animation to be a "running slug", i.e. when the bar is filled from left to right, it starts emptying from left to right, and repeat.)
    </div>
</template>
