import type { App, Plugin } from "vue";
import { MediaPlayerKey } from "../types";
import WebVideoPlayer from "./WebVideoPlayer.vue";

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
                },
                tracks: {
                    audioTrackSelection: true,
                },
                offline: {
                    downloads: false,
                    
                },
            },
        });
    },
};
