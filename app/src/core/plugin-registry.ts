import type { App } from "vue";
import { installMediaPlayer, MediaPlayerKey } from "virtual:media-player";

/**
 * Calls each `install*` from resolved `virtual:…` modules so services are `provide`d on the app.
 * Register additional build-swapped plugins here; auth and other setup stay outside this file.
 */
export function installPlugins(app: App): void {
    installMediaPlayer(app);
}

export const plugins = {
    mediaPlayer: { install: installMediaPlayer, MediaPlayerKey },
} as const;

export { installMediaPlayer, MediaPlayerKey };
export type { MediaPlayerService } from "@/plugins/media-player/contract";

/** Vue `app.use()` entry that registers injectable services from the active build target. */
export const appPluginsPlugin = {
    install(app: App) {
        installPlugins(app);
    },
};
