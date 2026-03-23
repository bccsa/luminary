import type { App, Plugin } from "vue";
import { MediaPlayerKey } from "../types";
import CapacitorVideoPlayer from "./CapacitorVideoPlayer.vue";

export const CapacitorPlatformPlugin: Plugin = {
    install(app: App) {
        app.provide(MediaPlayerKey, {
            VideoPlayer: CapacitorVideoPlayer,
            capabilities: {
                playback: {
                    nativePlayback: true,
                    nativeFullscreen: true,
                    pictureInPicture: true,
                    backgroundAudio: true,
                    seekControl: true,
                    playbackRateControl: true,
                },
                tracks: {
                    audioTrackSelection: true,
                },
                offline: {
                    downloads: true,
                    progressTracking: true,
                    deleteDownloadedMedia: true,
                },
            },
        });
    },
};
