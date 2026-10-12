<script setup lang="ts">
/**
 * One of the Video.js 10 skin's icons, drawn from the same path layers native full-screen draws, so the
 * portrait controls and the full-screen ones are the same shapes. Some layers are half-opaque and a few
 * are outlines. The colour is the text colour. `skip` draws the skip glyph instead: an arc, an
 * arrowhead and the seconds.
 */
import { computed } from "vue";
import { V10_GRID, V10_ICONS, type V10IconName } from "./v10Icons";

const props = defineProps<{
    name?: V10IconName;
    /** Draws the skip glyph for this many seconds, in `direction`. */
    skip?: { seconds: number; direction: "back" | "forward" };
}>();

const layers = computed(() => (props.name && !props.skip ? V10_ICONS[props.name] : []));

/** `skipIcon` in `controlsHtml.ts`, on its 24-unit grid. */
const skipPaths = computed(() => {
    if (!props.skip) return null;
    const forward = props.skip.direction === "forward";
    return {
        arc: forward ? "M20.5 12a8.5 8.5 0 1 1-2.9-6.4" : "M3.5 12a8.5 8.5 0 1 0 2.9-6.4",
        head: forward ? "M20.8 4.2v4.4h-4.4" : "M3.2 4.2v4.4h4.4",
        size: props.skip.seconds >= 100 ? 6 : 7.5,
    };
});
</script>

<template>
    <svg
        v-if="skipPaths && skip"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
        class="drop-shadow"
        data-test="v10Skip"
    >
        <path :d="skipPaths.arc" />
        <path :d="skipPaths.head" />
        <text
            x="12"
            y="15.2"
            text-anchor="middle"
            fill="currentColor"
            stroke="none"
            font-weight="700"
            :font-size="skipPaths.size"
        >
            {{ skip.seconds }}
        </text>
    </svg>
    <svg
        v-else
        :viewBox="`0 0 ${V10_GRID} ${V10_GRID}`"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
        class="drop-shadow"
        data-test="v10Icon"
    >
        <template
            v-for="(layer, i) in layers"
            :key="i"
        >
            <path
                v-if="layer.strokeWidth > 0"
                :d="layer.path"
                fill="none"
                stroke="currentColor"
                :stroke-width="layer.strokeWidth"
                stroke-linecap="round"
                stroke-linejoin="round"
                :opacity="layer.alpha"
            />
            <path
                v-else
                :d="layer.path"
                :opacity="layer.alpha"
            />
        </template>
    </svg>
</template>
