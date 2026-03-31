import type { Component } from "vue";
import type { MediaPlayerService } from "@/platform/contracts/media-player";
import { WebMediaPlayerService } from "@/platform/adapters/web/media-player.web";

/**
 * Default (web) factory. Capacitor and other native builds replace this
 * entire folder with a platform-specific implementation that exports the
 * same `createMediaPlayerService` function.
 */
export function createMediaPlayerService(audioPlayerComponent?: Component): MediaPlayerService {
    return new WebMediaPlayerService(audioPlayerComponent);
}
