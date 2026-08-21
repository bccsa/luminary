<script setup lang="ts">
type Props = {
    title: string;
    /** The Kratos flow and method this screen submits to, so the design carries its own wiring note. */
    flow?: string;
    theme: "light" | "dark";
};
defineProps<Props>();
</script>

<template>
    <figure class="m-0 flex w-[390px] shrink-0 flex-col gap-2">
        <figcaption class="flex flex-col gap-0.5 px-1">
            <span class="text-sm font-semibold text-zinc-900 dark:text-slate-100">{{ title }}</span>
            <span
                v-if="flow"
                class="font-mono text-xs text-zinc-500 dark:text-slate-400"
                >{{ flow }}</span
            >
        </figcaption>
        <div
            :class="theme === 'dark' ? 'dark' : ''"
            class="overflow-hidden rounded-xl border border-zinc-200 shadow-sm dark:border-slate-700"
        >
            <div
                class="flex min-h-[560px] items-center justify-center bg-white p-6 dark:bg-slate-900"
            >
                <slot />
            </div>
        </div>
    </figure>
</template>
