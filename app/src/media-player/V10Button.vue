<script setup lang="ts">
/**
 * A control of the Video.js 10 skin: a plain button, or, when `round`, the dark disc with a thin light
 * ring that the play and skip buttons sit in. Pressing shrinks it a touch, as the skin's does. The
 * icon goes in the slot and takes the text colour.
 */
defineProps<{ round?: boolean; label: string }>();
defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
    <button
        type="button"
        class="inline-flex items-center justify-center text-white transition-transform duration-100 active:scale-[0.94]"
        :class="
            round ? 'rounded-full bg-zinc-900/80 ring-1 ring-inset ring-white/20' : 'rounded-md'
        "
        :aria-label="label"
        data-test="v10Button"
        @click="$emit('click', $event)"
    >
        <slot />
    </button>
</template>
