import type { App, Component } from "vue";
import type { RuntimeInfo } from "@/platform/runtime";
import { MediaPlayerKey } from "@/platform/tokens";
import { WebMediaPlayerService } from "@/platform/adapters/web/media-player.web";

export interface MediaServicesInstallerOptions {
    audioPlayerComponent?: Component;
}

export function installMediaServices(
    app: App,
    runtime: RuntimeInfo,
    options: MediaServicesInstallerOptions = {},
): void {
    const mediaPlayerService = new WebMediaPlayerService(options.audioPlayerComponent);

    // Web-first implementation: native runtime can be overridden by deployment plugins.
    if (runtime.isNative) {
        app.provide(MediaPlayerKey, mediaPlayerService);
        return;
    }

    app.provide(MediaPlayerKey, mediaPlayerService);
}
