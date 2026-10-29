<script setup lang="ts">
import { computed } from "vue";
import type { ThumbnailSpriteCue } from "@luminary-media-converter/player-web";

/**
 * One frame out of a sprite sheet, with its timecode under it.
 *
 * Drawn as a background offset rather than an `<img>`, because the frame is a crop of a sheet holding
 * many: the element is a window onto the sheet, and moving to an adjacent frame costs no new request
 * since it is the same image. The frame renders at the crop's own pixel size and the whole element is
 * then scaled to `width`; scaling the background instead would need the sheet's total width, which a
 * cue does not carry, and tile sizes differ between encodes.
 *
 * The same look as the Video.js 8 player's `ScrubThumbnail`, which is the reference a native player
 * draws from.
 */
const props = withDefaults(
    defineProps<{
        cue: ThumbnailSpriteCue | null;
        /** Displayed width in pixels. The frame scales to it, keeping its aspect. */
        width?: number;
        /** Timecode drawn under the frame. */
        label: string;
        /** The chapter the frame is in, drawn beside the timecode. */
        chapter?: string;
    }>(),
    { width: 168 },
);

/** A cue with no `#xywh=` crop means the whole image is the frame. */
const isWholeImage = computed(() => !props.cue || !props.cue.w || !props.cue.h);
const scale = computed(() => (props.cue && !isWholeImage.value ? props.width / props.cue.w : 1));

const frameStyle = computed(() => {
    const cue = props.cue;
    if (!cue) return {};
    if (isWholeImage.value) {
        return {
            width: `${props.width}px`,
            aspectRatio: "16 / 9",
            backgroundImage: `url("${cue.spriteUrl}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
        };
    }
    return {
        width: `${cue.w}px`,
        height: `${cue.h}px`,
        backgroundImage: `url("${cue.spriteUrl}")`,
        backgroundSize: "auto",
        backgroundPosition: `-${cue.x}px -${cue.y}px`,
        backgroundRepeat: "no-repeat",
        transform: `scale(${scale.value})`,
        transformOrigin: "top left",
    };
});

/** A transform leaves the layout box at the native crop size, so the box that clips it is sized after the scale. */
const boxStyle = computed(() => {
    const cue = props.cue;
    if (!cue) return {};
    if (isWholeImage.value) return { width: `${props.width}px` };
    return {
        width: `${Math.round(cue.w * scale.value)}px`,
        height: `${Math.round(cue.h * scale.value)}px`,
    };
});
</script>

<template>
    <div
        class="lmpl-thumb"
        aria-hidden="true"
    >
        <div
            v-if="cue"
            class="lmpl-thumb-box"
            :style="boxStyle"
        >
            <div
                class="lmpl-thumb-frame"
                :style="frameStyle"
            ></div>
        </div>
        <span class="lmpl-thumb-time">{{ label }}</span>
        <span
            v-if="chapter"
            class="lmpl-thumb-chapter"
            >{{ chapter }}</span
        >
    </div>
</template>
