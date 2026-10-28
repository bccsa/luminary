import type { App } from "vue";
import { LuminaryPlayer } from "@luminary-media-converter/player-web";
import { VideoPlayerKey } from "@/build-time/contracts/video-player/token";

/**
 * The browser's player: the encoder's Video.js `LuminaryPlayer`, for every source. It lists the
 * videos up next in its own panel and offers the next one near the end of full-screen, so it takes
 * both lists.
 */
export function installVideoPlayer(app: App): void {
    app.provide(VideoPlayerKey, {
        component: LuminaryPlayer,
        acceptsNowPlaying: false,
        acceptsBrowse: true,
        acceptsNextUp: true,
    });
}

export { VideoPlayerKey } from "@/build-time/contracts/video-player/token";
export type {
    VideoNowPlaying,
    VideoPlayerHandle,
    VideoPlayerService,
} from "@/build-time/contracts/video-player/contract";
