import type { App } from "vue";
import { installMediaPlayer, MediaPlayerKey } from "virtual:media-player";

/**
 * Calls each `install*` from resolved `virtual:*` modules so build-target services
 * are `provide`d on the app.
 *
 * Only register services that are swapped via Vite virtual modules.
 * App bootstrap concerns stay in `main.ts`.
 */
export function installPlugins(app: App): void {
    installMediaPlayer(app);
}

export const plugins = {
    mediaPlayer: { install: installMediaPlayer, MediaPlayerKey },
} as const;

export { installMediaPlayer, MediaPlayerKey };
export type { MediaPlayerService } from "@/build-time-plugin-contracts/media-player/contract";

/** Vue `app.use()` entry that registers injectable services from the active build target. */
export const appPluginsManager = {
    install(app: App) {
        installPlugins(app);
    },
};
