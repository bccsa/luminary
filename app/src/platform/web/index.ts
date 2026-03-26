import type { App, Plugin } from "vue";
import { MediaPlayerKey, AudioPlayerKey, FileStorageKey, DownloadMetadataKey } from "@/platform/types";
import VideoPlayer from "@/components/content/VideoPlayer.vue";
import WebAudioPlayer from "./WebAudioPlayer.vue";
import { WebFileStorageService } from "./WebFileStorageService";
import { WebDownloadMetadataService } from "./WebDownloadMetadataService";

export const WebPlatformPlugin: Plugin = {
    install(app: App) {
        app.provide(MediaPlayerKey, {
            VideoPlayer,
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

        app.provide(AudioPlayerKey, {
            AudioPlayer: WebAudioPlayer,
            capabilities: {
                // Web audio is an <audio> element; background audio depends on browser/OS policies.
                backgroundAudio: false,
                playbackRateControl: true,
            },
        });

        app.provide(FileStorageKey, new WebFileStorageService());
        app.provide(DownloadMetadataKey, new WebDownloadMetadataService());
    },
};
