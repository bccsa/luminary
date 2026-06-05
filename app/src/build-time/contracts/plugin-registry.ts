import type { App } from "vue";
import { installMediaPlayer, MediaPlayerKey } from "virtual:media-player";
import { installDemoBanner, DemoBannerKey } from "virtual:demo-banner";

/**
 * Calls each `install*` from resolved `virtual:*` modules so build-target services
 * are `provide`d on the app.
 *
 * Only register services that are swapped via Vite virtual modules.
 * App bootstrap concerns stay in `main.ts`.
 */
export function installPlugins(app: App): void {
    installMediaPlayer(app);
    installDemoBanner(app);
}

export const plugins = {
    mediaPlayer: { install: installMediaPlayer, MediaPlayerKey },
    demoBanner: { install: installDemoBanner, DemoBannerKey },
} as const;

export { installMediaPlayer, MediaPlayerKey, installDemoBanner, DemoBannerKey };
export type { MediaPlayerService } from "@/build-time/contracts/media-player/contract";
export type { DemoBannerService } from "@/build-time/contracts/demo-banner/contract";

/** Vue `app.use()` entry that registers injectable services from the active build target. */
export const appPluginsManager = {
    install(app: App) {
        installPlugins(app);
    },
};
