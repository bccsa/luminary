<script setup lang="ts">
/**
 * WebVideoPlayer.vue — web / PWA implementation of the VideoPlayer contract.
 *
 * Uses Video.js for HLS streaming and YouTube playback in the browser.
 * Registered as the default VideoPlayer by WebPlatformPlugin (platform/web/index.ts).
 * On Capacitor builds, CapacitorPlatformPlugin replaces this with NativeVideoPlayer.
 *
 * This component is the canonical web player. It lives in platform/web/ so the
 * distinction between "web default" and "Capacitor override" is clear at a
 * glance when browsing the codebase.
 *
 * Props conform to VideoPlayerProps (platform/types/mediaPlayer.ts) so this
 * component is interchangeable with any other VideoPlayer implementation.
 */

import { onMounted, onUnmounted, ref, watch } from "vue";
import AudioVideoToggle from "@/components/form/AudioVideoToggle.vue";
import "videojs-mobile-ui";
import type Player from "video.js/dist/types/player";
import { type ContentDto } from "luminary-shared";
import px from "@/components/content/px.png";
import * as iso from "iso-639-2";
import LImage from "@/components/images/LImage.vue";
import {
    appLanguagesPreferredAsRef,
    getMediaProgress,
    removeMediaProgress,
    setMediaProgress,
    queryParams,
} from "@/globalConfig";
import { extractAndBuildAudioMaster } from "@/components/content/extractAndBuildAudioMaster";
import { isYouTubeUrl, convertToVideoJSYouTubeUrl } from "@/util/youtube";

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
    content: ContentDto;
    /**
     * BCP-47 language code for the preferred audio track.
     * The player selects the matching HLS audio rendition when tracks load
     * and when this prop changes (e.g. user switches language in SingleContent).
     */
    audioTrackLanguage: string | null | undefined;
};

const props = defineProps<Props>();

// ─── Player state ─────────────────────────────────────────────────────────────

const playerElement = ref<HTMLVideoElement>();
const audioModeToggle = ref<typeof AudioVideoToggle>();
let player: Player | null = null;

const audioMode = ref<boolean>(false);
const hasStarted = ref<boolean>(false);
const showAudioModeToggle = ref<boolean>(true);
const autoPlay = queryParams.get("autoplay") === "true";
const autoFullscreen = queryParams.get("autofullscreen") === "true";
const keepAudioAlive = ref<HTMLAudioElement | null>(null);
const isRestoringTrack = ref<boolean>(false);

const isYouTube = ref<boolean>(false);

if (props.content.video) {
    isYouTube.value = isYouTubeUrl(props.content.video);
    if (isYouTube.value) {
        showAudioModeToggle.value = false;
    }
}

// ─── Control-bar helpers ──────────────────────────────────────────────────────

const AUDIO_MODE_TIME_ADJUSTMENT = 0.25;

let timeout: ReturnType<typeof setTimeout> | undefined;
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
        showAudioModeToggle.value = true;
        player?.userActive(true);
    } else if (player?.userActive() || !hasStarted.value || player?.paused()) {
        showAudioModeToggle.value = true;
    } else {
        showAudioModeToggle.value = false;
    }
}

// ─── Audio track selection ────────────────────────────────────────────────────

/**
 * Activates the HLS audio rendition that matches the given BCP-47 language code.
 * Matches against both ISO 639-2/T and ISO 639-2/B codes embedded in the HLS
 * manifest (e.g. "nor" / "nob" → "nb").
 */
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

// ─── Background audio keep-alive (Safari / iOS web) ──────────────────────────
//
// When audio-only mode is active, a silent looping <audio> element keeps
// the browser's audio session alive so playback isn't interrupted when
// the screen locks on iOS Safari.

function syncKeepAudioStateAlive() {
    const audio = keepAudioAlive.value;
    if (!audioMode.value || !audio) return;

    if (!player?.paused()) {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch((e) => {
                console.warn("Silent audio play failed", e);
            });
        }
    } else {
        audio.pause();
    }
}

function stopKeepAudioAlive() {
    if (keepAudioAlive.value) {
        keepAudioAlive.value.pause();
        keepAudioAlive.value.currentTime = 0;
    }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(async () => {
    // Defer until after the first paint so CSS is applied and layout is stable.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const videojs = (await import("video.js")).default;

    if (isYouTube.value) {
        await import("videojs-youtube");
        // Allow the YouTube plugin time to register before setting the source.
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const options = {
        fluid: false,
        html5: {
            vhs: {
                overrideNative: true,
                enableLowInitialPlaylist: true,
                maxPlaylistRetries: 10,
                useBandwidthFromLocalStorage: true,
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
                ...(isYouTube.value ? [] : ["pictureInPictureToggle"]),
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

    if (typeof window !== "undefined" && window.document) {
        player = videojs(playerElement.value!, options);

        window.dispatchEvent(new CustomEvent("vjsPlayer", { detail: player }));

        // A 1×1 transparent pixel prevents the default Video.js poster frame.
        player.poster(px);

        const videoSource = props.content.video || props.content.video;
        if (isYouTube.value && props.content.video) {
            showAudioModeToggle.value = false;
            await new Promise((resolve) => requestAnimationFrame(resolve));

            player.src({
                type: "video/youtube",
                src: convertToVideoJSYouTubeUrl(props.content.video!),
            });

            player.on("loadedmetadata", () => {
                if (isYouTube.value && props.content.video) {
                    const progress = getMediaProgress(props.content.video, props.content._id);
                    if (progress > 60) {
                        setTimeout(() => {
                            player?.currentTime(progress - 30);
                        }, 100);
                    }
                }
            });

            player.on("ended", () => {
                if (props.content.video) {
                    removeMediaProgress(props.content.video, props.content._id);
                }
            });
        } else if (videoSource) {
            player.src({ type: "application/x-mpegURL", src: videoSource });
        }

        // @ts-expect-error 2024-04-12 Workaround: mobileUi types are not exported
        player.mobileUi({
            fullscreen: {
                enterOnRotate: true,
                exitOnRotate: true,
                lockOnRotate: true,
                lockToLandscapeOnEnter: true,
                disabled: false,
            },
            touchControls: { disabled: true },
        });

        player.on("loadeddata", () => {
            if (!isRestoringTrack.value) {
                setAudioTrackLanguage(appLanguagesPreferredAsRef.value[0].languageCode || null);
            }
        });

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

        player.on("waiting", () => {
            const currentTime = player?.currentTime() || 0;
            setTimeout(() => {
                if (player?.currentTime() === currentTime && !player?.paused()) {
                    console.warn("Player stalled, attempting to refresh buffer");
                    player?.currentTime(currentTime + 0.001);
                    if (!isRestoringTrack.value) {
                        setAudioTrackLanguage(
                            appLanguagesPreferredAsRef.value[0].languageCode || null,
                        );
                    }
                }
            }, 2000);
        });

        player.on(["mousemove", "click"], autoHidePlayerControls);

        player.on("play", () => {
            playerPlayEventHandler();
            if (audioMode.value) {
                requestAnimationFrame(() => {
                    syncKeepAudioStateAlive();
                });
            }
        });

        player.on(["useractive", "userinactive"], playerUserActiveEventHandler);

        // @ts-expect-error window is a native browser api, and matomo is attaching _paq to window
        if (window._paq) {
            // @ts-expect-error window is a native browser api, and matomo is attaching _paq to window
            window._paq.push(
                ["MediaAnalytics::enableMediaAnalytics"],
                ["MediaAnalytics::scanForMedia", window.document],
            );
        }

        let progressRemoved = false;

        player.on("timeupdate", () => {
            const currentTime = player?.currentTime() || 0;
            const durationTime = player?.duration() || 0;

            const videoSource = props.content.video || props.content.parentMedia?.hlsUrl;
            if (durationTime == Infinity || !videoSource || currentTime < 60) return;

            if (isYouTube.value && durationTime > 0 && currentTime >= durationTime - 1) {
                if (!progressRemoved) {
                    removeMediaProgress(props.content.video!, props.content._id);
                    progressRemoved = true;
                }
                return;
            }

            if (isYouTube.value && currentTime < durationTime - 2) {
                progressRemoved = false;
            }

            setMediaProgress(videoSource, props.content._id, currentTime, durationTime);
        });

        player.on("ready", () => {
            const videoSource = props.content.video || props.content.parentMedia?.hlsUrl;
            if (!videoSource) return;

            if (!isYouTube.value) {
                const progress = getMediaProgress(videoSource, props.content._id);
                if (progress > 60) player?.currentTime(progress - 30);
            }
        });

        player.on("ended", () => {
            const videoSource = props.content.video || props.content.parentMedia?.hlsUrl;
            if (!videoSource) return;
            stopKeepAudioAlive();
            removeMediaProgress(videoSource, props.content._id);
            progressRemoved = true;
            try {
                player?.exitFullscreen();
            } catch {
                // ignore
            }
        });

        player.on("pause", () => {
            const videoSource = props.content.video || props.content.parentMedia?.hlsUrl;
            if (!videoSource) return;

            if (audioMode.value) syncKeepAudioStateAlive();
            if (autoFullscreen)
                setTimeout(() => {
                    if (!player?.paused()) return;
                    try {
                        player?.exitFullscreen();
                    } catch {
                        // ignore
                    }
                }, 500);
        });
    }
});

onUnmounted(() => {
    stopKeepAudioAlive();

    if (player) {
        player.pause();
        player.off(["mousemove", "click"], autoHidePlayerControls);
        player.off("play", playerPlayEventHandler);
        player.off(["useractive", "userinactive"], playerUserActiveEventHandler);
        player.dispose();
        player = null;
    }

    window.dispatchEvent(new Event("vjsPlayerDestroyed"));
});

// ─── Audio mode watcher ───────────────────────────────────────────────────────
//
// Switching audio-only mode re-generates a manifest that contains only the
// audio renditions, swaps the player source, and adjusts the seek position
// to compensate for the slight timing offset introduced by the source change.

watch(audioMode, async (mode) => {
    if (isYouTube.value) {
        audioMode.value = false;
    }

    player?.audioOnlyMode(mode);
    player?.audioPosterMode(mode);
    player?.userActive(true);
    playerUserActiveEventHandler();

    const currentTime = player?.currentTime() || 0;

    let selectedTrackInfo: { label?: string; language?: string } | null = null;
    const tracks = (player as any).audioTracks?.();
    if (tracks) {
        for (let i = 0; i < tracks.length; i++) {
            if (tracks[i].enabled) {
                selectedTrackInfo = { label: tracks[i].label, language: tracks[i].language };
                break;
            }
        }
    }

    if (selectedTrackInfo) {
        isRestoringTrack.value = true;
    }

    const videoSource = props.content.video || props.content.parentMedia?.hlsUrl;
    let audioPlaylistUrl: string | null = null;
    if (mode && videoSource) {
        const audioMaster = await extractAndBuildAudioMaster(videoSource, selectedTrackInfo);
        const base64 = btoa(
            String.fromCharCode(
                ...Array.from(new Uint8Array(new TextEncoder().encode(audioMaster))),
            ),
        );
        audioPlaylistUrl = `data:application/x-mpegURL;base64,${base64}`;
    }

    const adjustedTime = Math.max(0, currentTime - (mode ? AUDIO_MODE_TIME_ADJUSTMENT : 0));

    const restoreTrack = () => {
        if (!selectedTrackInfo) return;
        const newTracks = (player as any).audioTracks?.();
        if (newTracks && newTracks.length > 0) {
            for (let i = 0; i < newTracks.length; i++) {
                const t = newTracks[i];
                t.enabled = t.language === selectedTrackInfo.language || t.label === selectedTrackInfo.label;
            }
        }
    };

    player?.one("loadedmetadata", () => {
        player?.currentTime(adjustedTime);
        if (!mode && selectedTrackInfo) restoreTrack();
    });

    player?.one("canplay", () => {
        if (!mode && selectedTrackInfo) restoreTrack();
        isRestoringTrack.value = false;
    });

    if (videoSource) {
        player?.src({
            type: "application/x-mpegURL",
            src: mode ? audioPlaylistUrl! : videoSource,
        });
    }

    const playPromise = player?.play();
    if (playPromise !== undefined) {
        playPromise.catch((error) => {
            console.debug("Initial play() interrupted:", error.message);
        });
    }

    if (mode) {
        syncKeepAudioStateAlive();
    } else {
        stopKeepAudioAlive();
    }
});

// ─── audioTrackLanguage prop watcher ─────────────────────────────────────────
//
// When the user selects a different language in SingleContent, the new language
// code is forwarded here and the matching HLS audio rendition is activated.

watch(
    () => props.audioTrackLanguage,
    (newLanguage) => {
        if (newLanguage && player) {
            setAudioTrackLanguage(newLanguage);
        }
    },
);
</script>

<style>
@import "video.js/dist/video-js.min.css";
@import "videojs-mobile-ui/dist/videojs-mobile-ui.css";
@import "./WebVideoPlayer.css";

.audio-mode-toggle {
    @apply !absolute right-2 top-2;
}
</style>

<template>
    <div class="relative bg-transparent md:rounded-lg">
        <LImage
            :image="content.parentImageData"
            aspectRatio="video"
            size="post"
            :content-parent-id="content.parentId"
            :parent-image-bucket-id="content.parentImageBucketId"
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

        <!-- Silent looping audio element that keeps the browser audio session
             alive when audio-only mode is active on iOS Safari. -->
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
