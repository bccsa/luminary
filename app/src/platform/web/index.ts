import type { App, Plugin } from "vue";
import { MediaPlayerKey } from "../types";
import WebVideoPlayer from "./WebVideoPlayer.vue";

export const WebPlatformPlugin: Plugin = {
    install(app: App) {
        app.provide(MediaPlayerKey, {
            VideoPlayer: WebVideoPlayer,
            capabilities: {
                backgroundAudio: false,
                offlineDownloads: false,
                nativeFullscreen: false,
            },
        });
    },
};
