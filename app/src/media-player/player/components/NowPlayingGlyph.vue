<script setup lang="ts">
import type { Glyph } from "../ui/nowPlayingGlyphs";

/** One of the now-playing screen's glyphs, drawn in the current colour. */
defineProps<{ glyph: Glyph; size?: number | string }>();
</script>

<template>
    <svg
        class="lmpl-glyph"
        :viewBox="`0 0 ${glyph.grid} ${glyph.grid}`"
        :width="size ?? 24"
        :height="size ?? 24"
        aria-hidden="true"
        focusable="false"
    >
        <path
            v-for="(layer, i) in glyph.layers"
            :key="i"
            :d="layer.d"
            :fill="layer.stroke ? 'none' : 'currentColor'"
            :fill-rule="layer.evenOdd ? 'evenodd' : undefined"
            :stroke="layer.stroke ? 'currentColor' : undefined"
            :stroke-width="layer.stroke || undefined"
            :stroke-linecap="layer.stroke ? 'round' : undefined"
            :stroke-linejoin="layer.stroke ? 'round' : undefined"
            :opacity="layer.alpha ?? undefined"
        />
    </svg>
</template>
