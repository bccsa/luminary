import type { App, Plugin } from "vue";
import { MediaPlayerKey } from "../types";
import CapacitorVideoPlayer from "./CapacitorVideoPlayer.vue";

export const CapacitorPlatformPlugin: Plugin = {
    install(app: App) {
        app.provide(MediaPlayerKey, {
            VideoPlayer: CapacitorVideoPlayer,
            capabilities: {
                backgroundAudio: true,
                offlineDownloads: true,
                nativeFullscreen: true,
            },
        });
    },
};
