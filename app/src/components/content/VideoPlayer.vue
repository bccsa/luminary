<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import AudioVideoToggle from "../form/AudioVideoToggle.vue";
import "videojs-mobile-ui";
import "videojs-youtube";
import type Player from "video.js/dist/types/player";
import { type ContentDto } from "luminary-shared";
import px from "./px.png";
import * as iso from "iso-639-2";
import LImage from "../images/LImage.vue";
import {
    appLanguagesPreferredAsRef,
    getMediaProgress,
    removeMediaProgress,
    setMediaProgress,
    queryParams,
} from "@/globalConfig";
import { extractAndBuildAudioMaster } from "./extractAndBuildAudioMaster";
import { isYouTubeUrl, convertToVideoJSYouTubeUrl } from "@/util/youtubeUtils";

type Props = {
    content: ContentDto;
    language: string | null | undefined;
};

const props = defineProps<Props>();

const playerElement = ref<HTMLVideoElement>();
const audioModeToggle = ref<typeof AudioVideoToggle>();
let player: Player | null = null;

const audioMode = ref<boolean>(false);
const hasStarted = ref<boolean>(false);
const showAudioModeToggle = ref<boolean>(true);
const autoPlay = queryParams.get("autoplay") === "true";
const autoFullscreen = queryParams.get("autofullscreen") === "true";
const keepAudioAlive = ref<HTMLAudioElement | null>(null);

// YouTube detection
const isYouTube = ref<boolean>(false);
// const youTubeThumbnail = ref<string | null>(null);

// Check if the current video is a YouTube video
if (props.content.video) {
    isYouTube.value = isYouTubeUrl(props.content.video);
    if (isYouTube.value) {
        // hides audio mode toggle for YouTube videos as it's not supported
        showAudioModeToggle.value = false;
    }
}

const AUDIO_MODE_TIME_ADJUSTMENT = 0.25;

let timeout: any;
function autoHidePlayerControls() {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
        player?.userActive(false);
    }, 3000);
}

function playerPlayEventHandler() {
    hasStarted.value = true;
    playerUserActiveEventHandler();
    if (autoFullscreen) player?.requestFullscreen();
}

function playerUserActiveEventHandler() {
    if (isYouTube.value) {
        showAudioModeToggle.value = false;
    }

    if (audioMode.value) {
        // Always show controls and toggle in audio-only mode
        showAudioModeToggle.value = true;
        player?.userActive(true);
    } else if (player?.userActive() || !hasStarted.value || player?.paused()) {
        showAudioModeToggle.value = true;
    } else {
        showAudioModeToggle.value = false;
    }
}

// Set the audio track language
function setAudioTrackLanguage(languageCode: string | null) {
    if (!player) {
        console.error("Player is not initialized.");
        return;
    }

    const audioTracks = (player as any).audioTracks();
    if (!audioTracks || audioTracks.length === 0) {
        console.warn("No audio tracks available.");
        return;
    }

    let trackFound = false;
    for (let i = 0; i < audioTracks.length; i++) {
        const track = audioTracks[i];

        if (
            iso.iso6392TTo1[track.language] === languageCode ||
            iso.iso6392BTo1[track.language] === languageCode
        ) {
            track.enabled = true;
            trackFound = true;
        } else {
            track.enabled = false;
        }
    }

    if (!trackFound) {
        console.warn(`No matching audio track found for language: ${languageCode}`);
    }
}

function syncKeepAudioStateAlive() {
    const audio = keepAudioAlive.value;
    if (!audioMode.value || !audio) return;

    // If the player is playing, play the silent audio to keep the audio context alive (especially for iOS/Safari)
    if (!player?.paused()) {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch((e) => {
                console.warn("Silent audio play failed", e);
            });
        }
    } else {
        // Pause the silent audio if the player is paused
        audio.pause();
    }
}

function stopKeepAudioAlive() {
    if (keepAudioAlive.value) {
        keepAudioAlive.value.pause();
        keepAudioAlive.value.currentTime = 0;
    }
}

onMounted(async () => {
    const videojs = (await import("video.js")).default;

    let options = {
        fluid: false,
        html5: {
            vhs: {
                overrideNative: true,
                enableLowInitialPlaylist: true, // Retries failed playlist fetches, which could prevent stalls if the audio playlist (.aac) fails to load.
                maxPlaylistRetries: 10, // Retries failed playlist fetches, which could prevent stalls if the audio playlist (.aac) fails to load.
                useBandwidthFromLocalStorage: true, // Use the bandwidth from local storage to prevent stalls if the audio playlist (.aac) fails to load.
                useDevicePixelRatio: true,
            },
            nativeAudioTracks: videojs.browser.IS_SAFARI,
            nativeVideoTracks: videojs.browser.IS_SAFARI,
        },
        autoplay: autoPlay,
        preload: "auto",
        enableSmoothSeeking: true,
        playbackRates: [0.5, 0.7, 1, 1.5],
        controlBar: {
            children: [
                "audioTrackButton",
                "playToggle",
                "progressControl",
                "liveDisplay",
                "fullscreenToggle",
                "pictureInPictureToggle",
                "playbackRateMenuButton",
                "volumePanel",
                "skipBackwardButton",
                "skipForward",
                "skipBackward",
            ],
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

    // Set player source based on video type (YouTube vs regular)
    if (isYouTube.value) {
        // add options for youtube

        player.src({
            type: "video/youtube",
            src: convertToVideoJSYouTubeUrl(props.content.video!),
        });
        // For YouTube videos, disable audio-only mode toggle since it's not supported for YouTube videos
        showAudioModeToggle.value = false;
    } else {
        player.src({ type: "application/x-mpegURL", src: props.content.video });
    }

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

    // Ensure audio tracks are ready when metadata is loaded
    player.on("loadeddata", () => {
        setAudioTrackLanguage(appLanguagesPreferredAsRef.value[0].languageCode || null);
    });

    // Ensure the audio track language is updated when entering fullscreen mode.
    // This checks if the current language has changed since the last time it was set,
    // and updates the audio track language accordingly.
    let lastLanguageSet: string | null = null;

    player.on("fullscreenchange", () => {
        if (player?.isFullscreen()) {
            const currentLanguage = appLanguagesPreferredAsRef.value[0].languageCode || null;
            if (lastLanguageSet !== currentLanguage) {
                setAudioTrackLanguage(currentLanguage);
                lastLanguageSet = currentLanguage;
            }
        }
    });

    // Handle the "waiting" event, which occurs when the player is buffering
    player.on("waiting", () => {
        const currentTime = player?.currentTime() || 0; // Get the current playback time
        setTimeout(() => {
            // Check if the player is still stalled after 2 seconds
            if (player?.currentTime() === currentTime && !player?.paused()) {
                console.warn("Player stalled, attempting to refresh buffer");

                // Slightly adjust the current time to refresh the buffer
                player?.currentTime(currentTime + 0.001);

                // Reapply the preferred audio track language
                setAudioTrackLanguage(appLanguagesPreferredAsRef.value[0].languageCode || null);
            }
        }, 2000);
    });

    // Workaround to hide controls on inactive mousemove. As the controlbar looks at mouse hover (and our CSS changes the controlbar to fill the player), we need to trigger the userActive method to hide the controls
    player.on(["mousemove", "click"], autoHidePlayerControls);

    // Get player playing state
    player.on("play", () => {
        playerPlayEventHandler();

        // If audio mode is enabled, sync the keep-alive audio state
        if (audioMode.value) {
            // Ensures user interaction already happened
            requestAnimationFrame(() => {
                syncKeepAudioStateAlive();
            });
        }
    });

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
        const currentTime = player?.currentTime() || 0;
        const durationTime = player?.duration() || 0;

        if (durationTime == Infinity || !props.content.video || currentTime < 60) return;
        setMediaProgress(props.content.video, props.content._id, currentTime, durationTime);
    });

    // Get and apply the player saved progress (rewind 30 seconds)
    player.on("ready", () => {
        if (!props.content.video) return;
        const progress = getMediaProgress(props.content.video, props.content._id);
        if (progress > 60) player?.currentTime(progress - 30);
    });

    player.on("ended", () => {
        if (!props.content.video) return;
        stopKeepAudioAlive();

        // Remove player progress on ended
        removeMediaProgress(props.content.video, props.content._id);

        try {
            player?.exitFullscreen();
        } catch {
            // Do nothing
        }
    });

    player.on("pause", () => {
        if (!props.content.video) return;

        if (audioMode.value) syncKeepAudioStateAlive();
        if (autoFullscreen)
            setTimeout(() => {
                if (!player?.paused()) return;
                try {
                    player?.exitFullscreen();
                } catch {
                    // Do nothing
                }
            }, 500);
    });
});

onUnmounted(() => {
    stopKeepAudioAlive();

    if (player) {
        // Pause the player first
        player.pause();

        // Remove all event listeners
        player.off(["mousemove", "click"], autoHidePlayerControls);
        player.off("play", playerPlayEventHandler);
        player.off(["useractive", "userinactive"], playerUserActiveEventHandler);

        // Dispose of the player completely
        player.dispose();
    }

    // emit event when player is Destroyed
    const playerDestroyEvent = new Event("vjsPlayerDestroyed");
    window.dispatchEvent(playerDestroyEvent);
});

watch(audioMode, async (mode) => {
    // Skip audio-only mode for YouTube videos as it's not supported
    if (isYouTube.value) {
        audioMode.value = false;
    }

    player?.audioOnlyMode(mode);
    player?.audioPosterMode(mode);
    player?.userActive(true);
    playerUserActiveEventHandler();

    // Save current time and selected track label/language
    const currentTime = player?.currentTime() || 0;

    let selectedTrackInfo: { label?: string; language?: string } | null = null;
    const tracks = (player as any).audioTracks?.();
    if (tracks) {
        for (let i = 0; i < tracks.length; i++) {
            if (tracks[i].enabled) {
                selectedTrackInfo = {
                    label: tracks[i].label,
                    language: tracks[i].language,
                };
                break;
            }
        }
    }

    // Extract and build an audio-only master playlist from the original HLS manifest
    const audioMaster = await extractAndBuildAudioMaster(props.content.video!);

    // For mobile compatibility, use a data URL if the playlist is small enough, otherwise fallback to blob URL
    let audioOnlyPlaylistUrl: string;

    /** We use base64-encode here because Videojs doesn't support HLS via blob
     * Because it is also videojs expect a direct HTTP(S) URL that the player
     * or native decoder can request as a standalone resource.
     */
    // base64-encoded data: URL for audio-only master
    const base64 = btoa(
        String.fromCharCode(...Array.from(new Uint8Array(new TextEncoder().encode(audioMaster)))),
    );
    // Construct a data URL for the playlist
    audioOnlyPlaylistUrl = `data:application/x-mpegURL;base64,${base64}`;

    // Set the player source based on the mode status
    player?.src({
        type: "application/x-mpegURL",
        src: mode ? audioOnlyPlaylistUrl : props.content.video,
    });

    player?.ready(() => {
        /**
         * When switching between audio and video modes, the player may introduce slight delays or offsets due to internal buffering, seeking, or reinitializing the media source.
         * A small adjustment like 0.25 seconds helps ensure that the playback position remains consistent and avoids noticeable jumps forward or backward.
         */
        const adjustedTime = Math.max(0, currentTime - (mode ? AUDIO_MODE_TIME_ADJUSTMENT : 0));
        player?.currentTime(adjustedTime);

        player?.play();

        // Wait for tracks to be available
        player?.on("loadedmetadata", () => {
            const newTracks = (player as any).audioTracks?.();

            if (!newTracks || !selectedTrackInfo) return;

            for (let i = 0; i < newTracks.length; i++) {
                const t = newTracks[i];
                const langMatch = t.language === selectedTrackInfo.language;
                const labelMatch = t.label === selectedTrackInfo.label;

                if (langMatch || labelMatch) {
                    t.enabled = true;
                } else {
                    t.enabled = false;
                }
            }
        });
    });

    if (mode) {
        syncKeepAudioStateAlive();
    } else {
        stopKeepAudioAlive();
    }
});

// Watch the language prop and update the audio track language dynamically
watch(
    () => props.language,
    (newLanguage) => {
        if (newLanguage) {
            setAudioTrackLanguage(newLanguage);
        }
    },
);
</script>

<style>
@import "video.js/dist/video-js.min.css";
@import "videojs-mobile-ui/dist/videojs-mobile-ui.css";
@import "./VideoPlayer.css";

.audio-mode-toggle {
    position: absolute !important;
    right: 0.5rem;
    top: 0.5rem;
}
</style>

<template>
    <div class="relative bg-transparent md:rounded-lg">
        <LImage
            :image="content.parentImageData"
            aspectRatio="video"
            size="post"
            :content-parent-id="content.parentId"
        />

        <div class="video-player absolute bottom-0 left-0 right-0 top-0">
            <video
                playsinline
                ref="playerElement"
                class="video-js h-full w-full md:rounded-lg"
                controls
                preload="auto"
                data-setup="{}"
                v-bind:data-matomo-title="props.content.title"
            ></video>
        </div>

        <!-- audio tag to keep player alive -->
        <audio ref="keepAudioAlive" loop muted preload="auto" style="display: none">
            <source src="../../assets/silence.wav" type="audio/wav" />
        </audio>

        <transition
            leave-active-class="transition ease-in duration-500"
            leave-from-class="opacity-100"
            enter-to-class="opacity-100"
            enter-active-class="transition ease-out duration-100"
            leave-to-class="opacity-0"
            enter-from-class="opacity-0"
        >
            <AudioVideoToggle
                v-if="showAudioModeToggle && !isYouTube"
                v-model="audioMode"
                ref="audioModeToggle"
                class="audio-mode-toggle"
            ></AudioVideoToggle>
        </transition>
    </div>
</template>
