<script setup lang="ts">
/**
 * A ring turning round a play button while the player gets ready: the button keeps showing what the viewer asked
 * for, and the ring says it is on its way. The button it sits in needs `position: relative`.
 */
</script>

<template>
    <svg
        class="pointer-events-none absolute -inset-1 animate-spin motion-reduce:[animation-duration:2.4s]"
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
    >
        <circle
            cx="24"
            cy="24"
            r="22.5"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-dasharray="35 107"
        />
    </svg>
</template>
