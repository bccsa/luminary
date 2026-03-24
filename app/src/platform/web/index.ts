import type { App, Plugin } from "vue";
import { MediaPlayerKey, FileStorageKey, DownloadMetadataKey } from "@/platform/types";
import WebVideoPlayer from "./WebVideoPlayer.vue";
import { WebFileStorageService } from "./WebFileStorageService";
import { WebDownloadMetadataService } from "./WebDownloadMetadataService";

export const WebPlatformPlugin: Plugin = {
    install(app: App) {
        app.provide(MediaPlayerKey, {
            VideoPlayer: WebVideoPlayer,
            capabilities: {
                playback: {
                    nativePlayback: false,
                    nativeFullscreen: false,
                    pictureInPicture: true,
                    backgroundAudio: false,
                    seekControl: true,
                    playbackRateControl: true,
                },
                tracks: {
                    audioTrackSelection: true,
                },
                offline: {
                    downloads: false,
                    progressTracking: false,
                    deleteDownloadedMedia: false,
                },
            },
        });

        app.provide(FileStorageKey, new WebFileStorageService());
        app.provide(DownloadMetadataKey, new WebDownloadMetadataService());
    },
};
