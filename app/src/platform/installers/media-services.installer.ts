import type { App, Component } from "vue";
import type { RuntimeInfo } from "@/platform/runtime";
import { MediaPlayerKey } from "@/platform/tokens";
import { createMediaPlayerService } from "@/platform/adapters/media-player";

export interface MediaServicesInstallerOptions {
    audioPlayerComponent?: Component;
}

/**
 * Provides the media-player service for the given platform.
 *
 * On web the built-in `WebMediaPlayerService` is used. For other builds
 * (e.g. Capacitor) the `platform/adapters/media-player` folder is replaced
 * with a platform-specific implementation that exports the same
 * `createMediaPlayerService` factory, so no changes to this installer are
 * required.
 */
export function installMediaServices(
    app: App,
    _runtime: RuntimeInfo,
    options: MediaServicesInstallerOptions = {},
): void {
    app.provide(MediaPlayerKey, createMediaPlayerService(options.audioPlayerComponent));
}
