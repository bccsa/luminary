<script setup lang="ts">
import type { Post, Tag } from "@/types";
import videojs from "video.js";
import "videojs-mobile-ui";
import { onMounted, onUnmounted, ref, watch } from "vue";
import AudioVideoToggle from "../form/AudioVideoToggle.vue";
import type Player from "video.js/dist/types/player";

type Props = {
    contentParent: Post | Tag;
};
const props = defineProps<Props>();

const playerElement = ref<HTMLVideoElement>();
const audioModeToggle = ref<typeof AudioVideoToggle>();
let player: Player;

const audioMode = ref<boolean>(false);
const hasStarted = ref<boolean>(false);
const showAudioModeToggle = ref<boolean>(true);

let timeout: any;
function autoHidePlayerControls() {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
        player.userActive(false);
    }, 3000);
}

function playerPlayEventHandler() {
    hasStarted.value = true;
}

function playerUserActiveEventHandler() {
    if (audioMode.value || player.userActive() || !hasStarted.value) {
        showAudioModeToggle.value = true;
    } else {
        showAudioModeToggle.value = false;
    }
}

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

    player = videojs(playerElement.value!, options);

    player.poster(props.contentParent.image);
    player.src({ type: "application/x-mpegURL", src: props.contentParent.content[0].video });

    // @ts-expect-error 2024-04-12 Workaround to get type checking to pass as we are not getting the mobileUi types import to work
    player.mobileUi({
        fullscreen: {
            enterOnRotate: true,
            exitOnRotate: true,
            lockOnRotate: true,
            lockToLandscapeOnEnter: true,
            disabled: false,
        },
        touchControls: {
            disabled: true,
        },
    });

    // Workaround to hide controls on inactive mousemove. As the controlbar looks at mouse hover (and our CSS changes the controlbar to fill the player), we need to trigger the userActive method to hide the controls
    player.on(["mousemove", "click"], autoHidePlayerControls);

    // Get player playing state
    player.on("play", playerPlayEventHandler);

    // Get player user active states
    player.on(["useractive", "userinactive"], playerUserActiveEventHandler);
});

onUnmounted(() => {
    player?.off(["mousemove", "click"], autoHidePlayerControls);
    player?.off("play", playerPlayEventHandler);
    player?.off(["useractive", "userinactive"], playerUserActiveEventHandler);
});

// Set player audio only mode
watch(audioMode, (newValue) => {
    player?.audioOnlyMode(newValue);
    playerUserActiveEventHandler();
});
</script>

<style>
@import "video.js/dist/video-js.min.css";
@import "videojs-mobile-ui/dist/videojs-mobile-ui.css";

@import "videoPlayerVideoMode.css";
@import "videoPlayerAudioMode.css";

.audio-mode-toggle-video-init {
    @apply !absolute bottom-2 right-2;
}

.audio-mode-toggle-video {
    @apply !absolute bottom-12 right-2;
}
</style>

<template>
    <div class="relative mb-2 rounded-lg bg-zinc-100 shadow-md dark:bg-zinc-800">
        <div class="relative">
            <img
                v-if="audioMode"
                :src="props.contentParent.image"
                class="mb-2 aspect-video w-full rounded-t-lg object-cover"
            />
        </div>

        <div :class="{ 'video-mode': !audioMode, 'audio-mode': audioMode }">
            <video
                ref="playerElement"
                class="video-js h-full w-full rounded-lg"
                controls
                preload="auto"
                data-setup="{}"
            ></video>
        </div>

        <transition
            leave-active-class="transition ease-in duration-500"
            leave-from-class="opacity-100"
            enter-to-class="opacity-100"
            enter-active-class="transition ease-out duration-100"
            leave-to-class="opacity-0"
            enter-from-class="opacity-0"
        >
            <AudioVideoToggle
                v-if="showAudioModeToggle"
                v-model="audioMode"
                ref="audioModeToggle"
                :class="{
                    'audio-mode-toggle-audio': audioMode,
                    'audio-mode-toggle-video-init': !audioMode && !hasStarted,
                    'audio-mode-toggle-video': !audioMode && hasStarted,
                }"
            ></AudioVideoToggle>
        </transition>
    </div>
</template>
