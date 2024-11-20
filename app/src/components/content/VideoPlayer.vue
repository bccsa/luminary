<script setup lang="ts">
import videojs from "video.js";
import "videojs-mobile-ui";
import { onMounted, onUnmounted, ref, watch } from "vue";
import AudioVideoToggle from "../form/AudioVideoToggle.vue";
import type Player from "video.js/dist/types/player";
import type { ContentDto } from "luminary-shared";
import px from "./px.png";
import LImage from "../images/LImage.vue";
import { getMediaProgress, removeMediaProgress, setMediaProgress } from "@/globalConfig";

type Props = {
    content: ContentDto;
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
    playerUserActiveEventHandler();
}

function playerUserActiveEventHandler() {
    if (audioMode.value || player.userActive() || !hasStarted.value || player.paused()) {
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
            skipButtons: {
                forward: 10,
                backward: 10,
            },
        },
    };

    player = videojs(playerElement.value!, options);

    // emit event with player on mount
    const playerEvent = new CustomEvent("vjsPlayer", { detail: player });
    window.dispatchEvent(playerEvent);

    player.poster(px); // Set the player poster to a 1px transparent image to prevent the default poster from showing
    player.src({ type: "application/x-mpegURL", src: props.content.video });

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

    // start video player analytics on mounted
    // @ts-expect-error window is a native browser api, and matomo is attaching _paq to window
    if (window._paq) {
        // @ts-expect-error window is a native browser api, and matomo is attaching _paq to window
        window._paq.push(
            ["MediaAnalytics::enableMediaAnalytics"],
            ["MediaAnalytics::scanForMedia", window.document],
        );
    }

    // Save player progress if greater than 60 seconds
    player.on("timeupdate", () => {
        const currentTime = player.currentTime() || 0;
        if (player.options_.liveui === true || !props.content.video || currentTime < 60) return;
        setMediaProgress(props.content.video, props.content._id, currentTime);
    });

    // Get and apply the player saved progress (rewind 30 seconds)
    player.on("ready", () => {
        if (!props.content.video) return;
        const progress = getMediaProgress(props.content.video, props.content._id);
        if (progress > 60) player.currentTime(progress - 30);
    });

    // Remove player progress on ended
    player.on("ended", () => {
        if (!props.content.video) return;
        removeMediaProgress(props.content.video, props.content._id);
    });
});

onUnmounted(() => {
    player?.off(["mousemove", "click"], autoHidePlayerControls);
    player?.off("play", playerPlayEventHandler);
    player?.off(["useractive", "userinactive"], playerUserActiveEventHandler);
    // emit event when player is Destroyed
    const playerDestroyEvent = new Event("vjsPlayerDestroyed");
    window.dispatchEvent(playerDestroyEvent);
});

// Set player audio only mode
watch(audioMode, (mode) => {
    player?.audioOnlyMode(mode);
    player?.audioPosterMode(mode);

    // Set player's user active state to true as a workaround to show audio track selection button on iOS
    player.userActive(true);

    playerUserActiveEventHandler();
});
</script>

<style>
@import "video.js/dist/video-js.min.css";
@import "videojs-mobile-ui/dist/videojs-mobile-ui.css";
@import "VideoPlayer.css";

.audio-mode-toggle {
    @apply !absolute right-2 top-2;
}
</style>

<template>
    <div class="relative mb-2 rounded-lg bg-transparent">
        <LImage
            v-if="content.parentImageData"
            :image="content.parentImageData"
            aspectRatio="video"
            size="post"
            fallbackImg="/img/fallback.jpg"
        />

        <div class="video-player absolute bottom-0 left-0 right-0 top-0">
            <video
                playsinline
                ref="playerElement"
                class="video-js h-full w-full rounded-lg"
                controls
                preload="auto"
                data-setup="{}"
                v-bind:data-matomo-title="props.content.title"
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
                class="audio-mode-toggle"
            ></AudioVideoToggle>
        </transition>
    </div>
</template>
