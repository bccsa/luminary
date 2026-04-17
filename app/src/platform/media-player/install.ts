import type { App, Component } from "vue";
import type { RuntimeInfo } from "@/platform/core/runtime";
import { MediaPlayerKey } from "./token";
import type { MediaPlayerService } from "./contract";
import { WebMediaPlayerService } from "./web/media-player.web";

export interface MediaServicesInstallerOptions {
    audioPlayerComponent?: Component;
    createMediaPlayerService?: (audioPlayerComponent?: Component) => MediaPlayerService;
}

/**
 * Provides the media-player service for the given platform.
 *
 * By default, installs `WebMediaPlayerService`. For other builds (e.g. Capacitor),
 * pass a `createMediaPlayerService` factory via `app.use(platformServicesPlugin, options)`.
 */
export function installMediaServices(
    app: App,
    _runtime: RuntimeInfo,
    options: MediaServicesInstallerOptions = {},
): void {
    const factory = options.createMediaPlayerService;
    const service = factory
        ? factory(options.audioPlayerComponent)
        : new WebMediaPlayerService(options.audioPlayerComponent);

    app.provide(MediaPlayerKey, service);
}
