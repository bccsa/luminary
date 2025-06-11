<script setup lang="ts">
import videojs from "video.js";
import "videojs-mobile-ui";
import { onMounted, onUnmounted, ref, watch } from "vue";
import AudioVideoToggle from "../form/AudioVideoToggle.vue";
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
const autoPlay = queryParams.get("autoplay") === "true";
const autoFullscreen = queryParams.get("autofullscreen") === "true";

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
    if (autoFullscreen) player.requestFullscreen();
}

function playerUserActiveEventHandler() {
    if (audioMode.value || player.userActive() || !hasStarted.value || player.paused()) {
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

    for (let i = 0; i < audioTracks.length; i++) {
        const track = audioTracks[i];

        track.enabled =
            iso.iso6392TTo1[track.language] === languageCode ||
            iso.iso6392BTo1[track.language] === languageCode;
    }
}

/**
 * Extracts and builds an audio master playlist from a given HLS manifest URL.
 *
 * @param {string} originalUrl - The URL of the original HLS manifest file.
 * @returns {Promise<string>} - A Promise that resolves to the generated audio master playlist as a string.
 */
async function extractAndBuildAudioMaster(originalUrl: string): Promise<string> {
    // Fetch the original HLS manifest
    const response = await fetch(originalUrl);

    // Read the manifest file content as text.
    const manifestText = await response.text();

    // Parse the manifest using m3u8-parser
    const parser = new Parser();

    // Push the manifest text into the parser for processing.
    parser.push(manifestText);

    // Finalize the parsing process.
    parser.end();

    // Retrieve the parsed manifest object from the parser.
    const parsedManifest = parser.manifest;
    // Get the directory of the manifest for resolving relative URIs
    const manifestDir = originalUrl.substring(0, originalUrl.lastIndexOf("/") + 1);

    // Extract audio media groups and playlists from the manifest
    const audioMedia = parsedManifest.mediaGroups?.AUDIO || {};
    const playlists = (parsedManifest.playlists || []) as unknown as {
        uri: string;
        attributes: Attributes;
    }[];

    // Initialize an array to store the lines of the new audio master playlist.
    const lines: string[] = ["#EXTM3U", "#EXT-X-VERSION:4", "#EXT-X-INDEPENDENT-SEGMENTS"];

    // Iterate through each audio group in the media groups.
    for (const group in audioMedia) {
        const variants = audioMedia[group];

        // Iterate through each audio variant in the group.
        for (const name in variants) {
            const track: any = (variants as Record<string, typeof track>)[name];

            // Check if the audio track has a URI defined.
            if (track.uri) {
                // Resolve the absolute URI of the audio track.
                const absoluteTrackUri = new URL(track.uri, manifestDir).toString();

                // Add an EXT-X-MEDIA tag for the audio track to the playlist.
                lines.push(
                    `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="${group}",NAME="${name}",LANGUAGE="${track.language}",DEFAULT=${track.default ? "YES" : "NO"},AUTOSELECT=${track.autoselect ? "YES" : "NO"},URI="${absoluteTrackUri}"`,
                );

                // Get the original relative URI (without query params)
                const relativeTrackUri = track.uri.split("?")[0];

                // Find the matching playlist for this audio group
                const matched = playlists.find(
                    (p) => p.attributes?.AUDIO === group && p.uri.includes(relativeTrackUri),
                );

                // Use the matched playlist's bandwidth or a default/random value
                const bandwidth =
                    matched?.attributes?.BANDWIDTH ?? 96000 + Math.floor(Math.random() * 64000);

                // Use the matched playlist's codecs or a default value
                const codecs =
                    typeof matched?.attributes?.CODECS === "string"
                        ? matched.attributes.CODECS
                        : "mp4a.40.2";

                // Add the EXT-X-STREAM-INF line for this audio track
                const streamInfLine = `#EXT-X-STREAM-INF:AUDIO="${group}",BANDWIDTH=${bandwidth},CODECS="${codecs}"`;

                lines.push(streamInfLine);
                lines.push(absoluteTrackUri);
            }
        }
    }

    // Join all lines to form the final playlist string
    return lines.join("\n");
}

onMounted(() => {
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

    // Ensure audio tracks are ready when metadata is loaded
    player.on("loadeddata", () => {
        setAudioTrackLanguage(appLanguagesPreferredAsRef.value[0].languageCode || null);
    });

    // Ensure the audio track language is updated when entering fullscreen mode.
    // This checks if the current language has changed since the last time it was set,
    // and updates the audio track language accordingly.
    let lastLanguageSet: string | null = null;

    player.on("fullscreenchange", () => {
        if (player.isFullscreen()) {
            const currentLanguage = appLanguagesPreferredAsRef.value[0].languageCode || null;
            if (lastLanguageSet !== currentLanguage) {
                setAudioTrackLanguage(currentLanguage);
                lastLanguageSet = currentLanguage;
            }
        }
    });

    // Handle the "waiting" event, which occurs when the player is buffering
    player.on("waiting", () => {
        const currentTime = player.currentTime() || 0; // Get the current playback time
        setTimeout(() => {
            // Check if the player is still stalled after 2 seconds
            if (player.currentTime() === currentTime && !player.paused()) {
                console.warn("Player stalled, attempting to refresh buffer");

                // Slightly adjust the current time to refresh the buffer
                player.currentTime(currentTime + 0.001);

                // Reapply the preferred audio track language
                setAudioTrackLanguage(appLanguagesPreferredAsRef.value[0].languageCode || null);
            }
        }, 2000);
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
        const durationTime = player.duration() || 0;
        if (player.options_.liveui === true || !props.content.video || currentTime < 60) return;
        setMediaProgress(props.content.video, props.content._id, currentTime, durationTime);
    });

    // Get and apply the player saved progress (rewind 30 seconds)
    player.on("ready", () => {
        if (!props.content.video) return;
        const progress = getMediaProgress(props.content.video, props.content._id);
        if (progress > 60) player.currentTime(progress - 30);
    });

    player.on("ended", () => {
        if (!props.content.video) return;
        // Remove player progress on ended
        removeMediaProgress(props.content.video, props.content._id);

        try {
            player.exitFullscreen();
        } catch {
            // Do nothing
        }
    });

    player.on("pause", () => {
        if (!props.content.video) return;

        if (autoFullscreen)
            setTimeout(() => {
                if (!player.paused()) return;
                try {
                    player.exitFullscreen();
                } catch {
                    // Do nothing
                }
            }, 500);
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

watch(audioMode, async (mode) => {
    player?.audioOnlyMode(mode);
    player?.audioPosterMode(mode);
    player.userActive(true);
    playerUserActiveEventHandler();

    // Save current time and selected track label/language
    const currentTime = player.currentTime() || 0;

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

    // Switch source
    if (mode) {
        player.audioOnlyMode(true); // <- important for Safari

        // Extract and build an audio-only master playlist from the original HLS manifest
        const audioMaster = await extractAndBuildAudioMaster(props.content.video!);

        // For mobile compatibility, use a data URL if the playlist is small enough, otherwise fallback to blob URL
        let playlistUrl: string;

        /** We use base64-encode here because Videojs doesn't support HLS via blob
         * Because it is also videojs expect a direct HTTP(S) URL that the player
         * or native decoder can request as a standalone resource.
         */
        // base64-encoded data: URL for audio-only master
        const base64 = btoa(
            String.fromCharCode(
                ...Array.from(new Uint8Array(new TextEncoder().encode(audioMaster))),
            ),
        );
        // Construct a data URL for the playlist
        playlistUrl = `data:application/x-mpegURL;base64,${base64}`;

        // Set the player source to the generated audio-only playlist
        player.src({ type: "application/x-mpegURL", src: playlistUrl });
    } else {
        player.src({ type: "application/x-mpegURL", src: props.content.video });
    }

    player.ready(() => {
        player.currentTime(currentTime);
        player.play();

        // Wait for tracks to be available
        player.on("loadedmetadata", () => {
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
});

// Watch for changes in appLanguageAsRef
watch(appLanguagesPreferredAsRef, (newLanguage) => {
    if (player && newLanguage) {
        setAudioTrackLanguage(newLanguage[0].languageCode || null);
    }
    return;
});
</script>

<style>
@import "video.js/dist/video-js.min.css";
@import "videojs-mobile-ui/dist/videojs-mobile-ui.css";
@import "./VideoPlayer.css";

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
