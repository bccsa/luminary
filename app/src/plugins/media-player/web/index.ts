import type { App, Component } from "vue";
import AudioPlayer from "@/components/content/AudioPlayer.vue";
import { MediaPlayerKey } from "../token";
import type { MediaPlayerService } from "../contract";
import { WebMediaPlayerService } from "./media-player.web";

export interface MediaPlayerInstallOptions {
    audioPlayerComponent?: Component;
}

export function createMediaPlayerService(options: MediaPlayerInstallOptions = {}): MediaPlayerService {
    return new WebMediaPlayerService(options.audioPlayerComponent ?? AudioPlayer);
}

export function installMediaPlayer(app: App, options: MediaPlayerInstallOptions = {}): void {
    app.provide(MediaPlayerKey, createMediaPlayerService(options));
}

export { MediaPlayerKey } from "../token";
export type { MediaPlayerService, MediaPlayerState, NowPlayingInfo } from "../contract";
