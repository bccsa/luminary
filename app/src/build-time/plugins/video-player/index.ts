import type { App } from "vue";
import { LuminaryPlayer } from "@luminary-media-converter/player-web";
import { VideoPlayerKey } from "@/build-time/contracts/video-player/token";

/** The browser's player: the encoder's Video.js `LuminaryPlayer`, for every source. */
export function installVideoPlayer(app: App): void {
    app.provide(VideoPlayerKey, { component: LuminaryPlayer, acceptsNowPlaying: false });
}

export { VideoPlayerKey } from "@/build-time/contracts/video-player/token";
export type {
    VideoNowPlaying,
    VideoPlayerHandle,
    VideoPlayerService,
} from "@/build-time/contracts/video-player/contract";
