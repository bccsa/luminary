<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { ThumbnailSpriteCue } from "@luminary-media-converter/player-web";

/**
 * The scrubbed frame filling a picture while the timeline is held. A crop of a sheet cannot be `cover`ed
 * directly, so the element is the crop's own size and scaled up to the picture, as the hover thumbnail is.
 *
 * Sized from its own root rather than the host's, so it fits wherever it is mounted.
 */
const props = defineProps<{ cue: ThumbnailSpriteCue }>();

const root = ref<HTMLElement | null>(null);
const frame = ref({ width: 0, height: 0 });
let observer: ResizeObserver | undefined;

function measure(): void {
    const el = root.value;
    if (el) frame.value = { width: el.clientWidth, height: el.clientHeight };
}

onMounted(() => {
    measure();
    if (typeof ResizeObserver !== "undefined" && root.value) {
        observer = new ResizeObserver(measure);
        observer.observe(root.value);
    }
});
onBeforeUnmount(() => observer?.disconnect());

const frameStyle = computed(() => {
    const cue = props.cue;
    if (!cue.w || !cue.h) {
        return {
            width: "100%",
            height: "100%",
            backgroundImage: `url("${cue.spriteUrl}")`,
            backgroundSize: "contain",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
        };
    }
    const scale =
        frame.value.width && frame.value.height
            ? Math.min(frame.value.width / cue.w, frame.value.height / cue.h)
            : 1;
    return {
        width: `${cue.w}px`,
        height: `${cue.h}px`,
        backgroundImage: `url("${cue.spriteUrl}")`,
        backgroundPosition: `-${cue.x}px -${cue.y}px`,
        backgroundRepeat: "no-repeat",
        transform: `scale(${scale})`,
        transformOrigin: "center",
    };
});
</script>

<template>
    <div
        ref="root"
        class="lmpl-scrub-picture"
    >
        <div
            class="lmpl-scrub-picture-frame"
            :style="frameStyle"
        ></div>
    </div>
</template>
