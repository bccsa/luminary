<script setup lang="ts">
/**
 * A short list of choices that opens just above the button it belongs to: the parent is `relative`, and
 * the list takes the button's left edge and only the width its choices need. Laid out as the full-screen
 * skin's menu is, a rounded card with a small heading over its rows, in the page's own colours.
 */
defineProps<{ title?: string }>();
</script>

<template>
    <div
        class="absolute bottom-full left-0 z-10 mb-2 w-max min-w-[10.5rem] max-w-[14rem] rounded-[14px] bg-white p-1 shadow-xl ring-1 ring-black/10 dark:bg-slate-700 dark:ring-white/10"
        data-test="mediaPlayerMenu"
    >
        <p
            v-if="title"
            class="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase leading-4 tracking-[0.06em] text-zinc-500 dark:text-slate-300"
            data-test="mediaPlayerMenuTitle"
        >
            {{ title }}
        </p>
        <ul class="whitespace-nowrap">
            <slot />
        </ul>
    </div>
</template>
