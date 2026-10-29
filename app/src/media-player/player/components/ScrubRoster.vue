<script setup lang="ts">
import { computed } from "vue";
import type { ThumbnailSpriteCue } from "@luminary-media-converter/player-web";

/**
 * The strip of frames shown under the timeline while it is held: the stretch of the video around the
 * playhead, sliding past a marker that stays under the pointer.
 *
 * Each frame is a crop of a sprite sheet, drawn the way `ScrubThumbnail` draws one: a window the size of
 * the crop, scaled to the roster's height. A tile without a cue yet stays dark rather than leaving a hole.
 */
const props = defineProps<{
    tiles: { key: string; left: number; cue: ThumbnailSpriteCue | null }[];
    /** Each frame's width and the roster's height, in px. */
    tileWidth: number;
    height: number;
    /** Where the marker sits, in px from the roster's left. */
    markerX: number;
    /** Gap, in px, between the player's bottom edge and the roster's. */
    bottom: number;
    /** A pinned roster: it takes the pointer (to be dragged). A press outside it closes it. */
    interactive?: boolean;
}>();

/** Slid into place rather than laid out: the strip moves every frame while the video plays under it. */
function tileStyle(tile: { left: number }) {
    return {
        transform: `translate3d(${Math.round(tile.left)}px, 0, 0)`,
        width: `${props.tileWidth}px`,
        height: `${props.height}px`,
    };
}

function frameStyle(cue: ThumbnailSpriteCue) {
    if (!cue.w || !cue.h) {
        return {
            width: "100%",
            height: "100%",
            backgroundImage: `url("${cue.spriteUrl}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
        };
    }
    return {
        width: `${cue.w}px`,
        height: `${cue.h}px`,
        backgroundImage: `url("${cue.spriteUrl}")`,
        backgroundPosition: `-${cue.x}px -${cue.y}px`,
        backgroundRepeat: "no-repeat",
        transform: `scale(${props.height / cue.h})`,
        transformOrigin: "top left",
    };
}

const rosterStyle = computed(() => ({
    bottom: `${props.bottom}px`,
    height: `${props.height}px`,
    "--lmpl-marker": `${props.markerX}px`,
}));

const markerStyle = computed(() => ({ left: `${props.markerX}px` }));
</script>

<template>
    <div
        class="lmpl-roster"
        :class="{ 'lmpl-roster-interactive': interactive }"
        :style="rosterStyle"
        :aria-hidden="interactive ? undefined : 'true'"
    >
        <div
            v-for="tile in tiles"
            :key="tile.key"
            class="lmpl-roster-tile"
            :style="tileStyle(tile)"
        >
            <div
                v-if="tile.cue"
                class="lmpl-roster-frame"
                :style="frameStyle(tile.cue)"
            ></div>
        </div>
        <div class="lmpl-roster-vignette"></div>
        <div
            class="lmpl-roster-marker"
            :style="markerStyle"
        ></div>
    </div>
</template>
