<script setup lang="ts">
import type { Post, Tag } from "@/types";
import videojs from "video.js";
import "videojs-mobile-ui";
import "videojs-mobile-ui/dist/videojs-mobile-ui.css";
import { onMounted, ref } from "vue";

type Props = {
    contentParent: Post | Tag;
};

const props = defineProps<Props>();

const playerElement = ref<HTMLVideoElement>();

onMounted(() => {
    let options = {
        fluid: false,
        html5: {
            vhs: {
                overrideNative: true,
            },
            nativeAudioTracks: videojs.browser.IS_SAFARI,
            nativeVideoTracks: videojs.browser.IS_SAFARI,
        },
        autoplay: false,
        preload: "auto",
        controlBar: {
            muteToggle: false,
            volumePanel: false,
            remainingTimeDisplay: false,
        },
    };

    const player = videojs(playerElement.value!, options);

    player.poster(props.contentParent.image);
    player.src({ type: "application/x-mpegURL", src: props.contentParent.content[0].video });

    //@ts-expect-error 2024-04-12 Workaround to get type checking to pass as we are not getting the mobileUi types import to work
    player.mobileUi({
        fullscreen: {
            enterOnRotate: true,
            exitOnRotate: true,
            lockOnRotate: true,
            lockToLandscapeOnEnter: false,
            disabled: false,
        },
        touchControls: {
            disabled: true,
        },
    });
});
</script>

<style>
@import "video.js/dist/video-js.min.css";

.vjs-tech {
    @apply !rounded-lg;
}

.vjs-poster img {
    @apply !rounded-lg object-cover;
}

.vjs-big-play-button {
    @apply !border-none !text-3xl;
    background-color: rgba(0, 0, 0, 0.3) !important;
}

.vjs-big-play-button span {
    @apply !text-5xl;
}

.vjs-control-bar {
    @apply !relative !h-full !w-full rounded-md;
    background-color: rgba(0, 0, 0, 0.3) !important;
}

:is(.vjs-has-started) .vjs-control-bar {
    @apply block;
}

.vjs-control {
    @apply !float-right !h-11 !w-11 !text-sm !outline-none;
}

.vjs-play-control {
    @apply !absolute !inset-0 !m-auto !h-16 !w-16 !text-xl;
}

.vjs-audio-button {
    @apply !float-left;
}

.vjs-progress-control {
    @apply !absolute !bottom-0 !left-0 !pl-2 !pr-0;
    width: calc(100% - 40px) !important;
}

.vjs-live-control {
    @apply !absolute !bottom-0 !left-0 !pl-2 !pr-0;
}

.vjs-live-display {
    @apply p-3 pl-2;
}

.vjs-slider {
    @apply !rounded-full;
}

.vjs-slider-bar {
    @apply !rounded-full;
}

.vjs-fullscreen-control {
    @apply !absolute !bottom-0 !right-0;
}

.vjs-menu {
    @apply !left-11 !top-0 !outline-none;
}

.vjs-menu-content {
    @apply !top-4 !h-fit rounded-md !bg-zinc-50 text-zinc-900 shadow-lg;
}

.vjs-selected {
    @apply !bg-zinc-300 font-bold focus:!bg-zinc-300;
}

:not(.vjs-selected) {
    @apply focus:!bg-transparent;
}

.vjs-menu-button {
    @apply !outline-none;
}
.vjs-menu-item {
    @apply !p-3 !text-sm !outline-none;
    width: 100% !important;
}
</style>

<template>
    <div class="aspect-video">
        <video
            ref="playerElement"
            class="video-js h-full w-full rounded-lg shadow-md"
            controls
            preload="auto"
            data-setup="{}"
        ></video>
    </div>
</template>
