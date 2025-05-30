<script setup lang="ts">
import videojs from "video.js";
import "videojs-mobile-ui";
import { onMounted, onUnmounted, ref, watch } from "vue";
import type Player from "video.js/dist/types/player";
import { type ContentDto } from "luminary-shared";
import * as iso from "iso-639-2";
import {
    appLanguagesPreferredAsRef,
    getMediaProgress,
    removeMediaProgress,
    setMediaProgress,
} from "@/globalConfig";
// import { Parser } from "m3u8-parser";

type Props = {
    content: ContentDto;
};
const props = defineProps<Props>();

const playerElement = ref<HTMLAudioElement>();
let player = defineModel<Player | null>("player", { required: true });

// const baseUrl = ref<string>("");
// const audioTracks = ref<{ groupId: string; language: string; name: string; uri: string }[]>([]);
// const selectedAudioUri = ref<string | null>(null);

// async function loadAudioTracks() {
//     // Check if the video URL is provided
//     if (!props.content.video) {
//         console.warn("No video URL provided in content.");
//         return;
//     }

//     // Dispose of the existing player if it exists
//     if (player.value) {
//         player.value.dispose();
//         player.value = null;
//     }

//     baseUrl.value = new URL(props.content.video).origin;
//     const res = await fetch(props.content.video);
//     const manifestText = await res.text();

//     const parser = new Parser();
//     parser.push(manifestText);
//     parser.end();

//     const parsedTracks = [];
//     const audioGroups = parser.manifest.mediaGroups?.AUDIO ?? {};

//     console.log("Audio groups found:", audioGroups.Stereo);

//     for (const groupId in audioGroups) {
//         const group = audioGroups[groupId] as Record<string, any>;
//         for (const name in group) {
//             const track = group[name];
//             if (track.uri) {
//                 parsedTracks.push({
//                     groupId,
//                     language: track.language,
//                     name: track.name,
//                     uri: track.uri,
//                 });
//             }
//         }
//     }
//     audioTracks.value = parsedTracks;

//     // Auto-select the first available track
//     if (parsedTracks.length > 0) {
//         selectedAudioUri.value = parsedTracks[0].uri;

//         console.log(baseUrl.value);
//     }
// }

// Set the audio track language
function setAudioTrackLanguage(languageCode: string | null) {
    if (!player.value || (!player.value as any).audioTracks) {
        console.warn("Player or audio tracks not available.");
        return;
    }

    const audioTracks = (player.value as any).audioTracks();
    if (!audioTracks || audioTracks.length === 0) {
        console.warn("No audio tracks available.");
        return;
    }

    let matchedTrack = false;

    // console.log("Target language code:", languageCode);

    for (let i = 0; i < audioTracks.length; i++) {
        const track = audioTracks[i];
        const isMatch =
            (iso.iso6392TTo1[track.language] || track.language) === languageCode ||
            (iso.iso6392BTo1[track.language] || track.language) === languageCode ||
            track.language === languageCode; // Direct match as fallback
        track.enabled = isMatch;
        if (isMatch) matchedTrack = true;
    }

    if (!matchedTrack) {
        console.warn(
            `No track found for language code: ${languageCode}. Defaulting to first track.`,
        );
        audioTracks[0].enabled = true; // Fallback to first track
    }
}

onMounted(() => {
    const options = {
        controls: true,
        autoplay: false,
        preload: "auto",
        techOrder: ["html5"],
        html5: {
            vhs: {
                overrideNative: true,
            },
            nativeAudioTracks: videojs.browser.IS_SAFARI,
            nativeVideoTracks: videojs.browser.IS_SAFARI,
        },
        controlBar: {
            children: [
                "audioTrackButton",
                "playToggle",
                "progressControl",
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

    player.value = videojs(playerElement.value!, options);
    player.value.src({ type: "application/x-mpegURL", src: props.content.video });

    // Set audio track when metadata is loaded
    player.value.on("loadedmetadata", () => {
        const preferredLanguage = appLanguagesPreferredAsRef.value[0]?.languageCode;
        setAudioTrackLanguage(preferredLanguage);
    });

    // Monitor track changes
    player.value.on("audiotrackchange", () => {
        const activeTracks = Array.from((player.value as any).audioTracks()).filter(
            (track: any) => track.enabled,
        );
        console.log(
            "Active audio track changed:",
            activeTracks.map((track: any) => track.language),
        );
    });

    player.value.on("timeupdate", () => {
        if (!player.value) return;
        const currentTime = player.value.currentTime() || 0;
        if (!props.content.video || currentTime < 60) return;
        setMediaProgress(props.content.video, props.content._id, currentTime);
    });

    player.value.on("ready", () => {
        if (!props.content.video || !player.value) return;
        const progress = getMediaProgress(props.content.video, props.content._id);
        if (progress > 60) player.value.currentTime(progress - 30);
    });

    player.value.on("ended", () => {
        if (!props.content.video) return;
        removeMediaProgress(props.content.video, props.content._id);
    });
});

onUnmounted(() => {
    player.value?.dispose();
});

// Watch for changes in appLanguageAsRef
watch(appLanguagesPreferredAsRef, (newLanguage) => {
    if (player.value && newLanguage) {
        setAudioTrackLanguage(newLanguage[0]?.languageCode);
    }
});
</script>

<style>
@import "AudioPlayer.css";
</style>

<template>
    <div class="relative rounded bg-transparent md:rounded-lg">
        <div class="audio-player rounded bg-white dark:bg-slate-700 md:rounded-lg">
            <audio
                ref="playerElement"
                class="video-js vjs-default-skin w-full"
                controls
                playsinline
                preload="auto"
                :data-matomo-title="props.content.title"
            ></audio>
        </div>
    </div>
</template>
