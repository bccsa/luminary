<script setup lang="ts">
/**
 * A short list of choices that opens just above the button it belongs to: the parent is
 * `relative`, and the list takes the button's left edge and only the width its choices need.
 */
</script>

<template>
    <ul
        class="absolute bottom-full left-0 z-10 mb-2 w-max min-w-[8.5rem] max-w-[14rem] overflow-hidden whitespace-nowrap rounded-xl bg-white py-1 shadow-xl ring-1 ring-black/10 dark:bg-slate-700 dark:ring-white/10"
        data-test="mediaPlayerMenu"
    >
        <slot />
    </ul>
</template>
