<script setup lang="ts">
/**
 * A control of the Video.js 10 skin: a plain button, or, when `round`, the disc with a thin ring that the
 * play and skip buttons sit in: dark with a light ring and icon in the dark theme, light with a dark icon in
 * the light one. Pressing shrinks it a touch, as the skin's does. The
 * icon goes in the slot and takes the text colour.
 */
defineProps<{ round?: boolean; label: string }>();
defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
    <button
        type="button"
        class="inline-flex items-center justify-center text-zinc-800 transition-transform duration-100 active:scale-[0.94] dark:text-white"
        :class="
            round
                ? 'rounded-full bg-white/85 ring-1 ring-inset ring-black/10 dark:bg-zinc-900/80 dark:ring-white/20'
                : 'rounded-md'
        "
        :aria-label="label"
        data-test="v10Button"
        @click="$emit('click', $event)"
    >
        <slot />
    </button>
</template>
