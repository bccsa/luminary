import type { App } from "vue";
import { installMediaPlayer, MediaPlayerKey } from "virtual:media-player";

/**
 * Build-time–selected media player only. Auth stays in `@/auth` for now.
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
