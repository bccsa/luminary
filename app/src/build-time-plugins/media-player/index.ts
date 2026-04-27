import type { App, Component } from "vue";
import AudioPlayer from "@/components/content/AudioPlayer.vue";
import { MediaPlayerKey } from "@/build-time-plugin-contracts/media-player/token";
import type { MediaPlayerService } from "@/build-time-plugin-contracts/media-player/contract";
import { WebMediaPlayerService } from "./media-player-web";

export interface MediaPlayerInstallOptions {
    audioPlayerComponent?: Component;
}

export function createMediaPlayerService(options: MediaPlayerInstallOptions = {}): MediaPlayerService {
    return new WebMediaPlayerService(options.audioPlayerComponent ?? AudioPlayer);
}

export function installMediaPlayer(app: App, options: MediaPlayerInstallOptions = {}): void {
    app.provide(MediaPlayerKey, createMediaPlayerService(options));
}

export { MediaPlayerKey } from "@/build-time-plugin-contracts/media-player/token";
export type { MediaPlayerService, MediaPlayerState, NowPlayingInfo } from "@/build-time-plugin-contracts/media-player/contract";
