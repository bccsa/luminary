import type { App } from "vue";
import { installDemoBanner, DemoBannerKey } from "virtual:demo-banner";
import { installPlatformChrome, PlatformChromeKey } from "virtual:platform-chrome";
import { installAuthFlow, AuthFlowKey } from "virtual:auth-flow";
import { installScreenWake, ScreenWakeKey } from "virtual:screen-wake";
import { installVideoPlayer, VideoPlayerKey } from "virtual:video-player";
import { installAppUpdate, AppUpdateKey } from "virtual:app-update";
import { installShare, ShareKey } from "virtual:share";
import { installDownloads, DownloadsKey } from "virtual:downloads";
import { installAppPromo, AppPromoKey } from "virtual:app-promo";
import { provideAppPromoHolder } from "@/build-time/plugins/app-promo/provide";

/**
 * Calls each `install*` from resolved `virtual:*` modules so build-target services
 * are `provide`d on the app.
 *
 * Only register services that are swapped via Vite virtual modules.
 * App bootstrap concerns stay in `main.ts`.
 *
 * @returns Settles once downloads are provided or known absent, so the caller can hold the mount for consumers that
 * inject once at setup. Never rejects.
 */
export function installPlugins(app: App): Promise<void> {
    installDemoBanner(app);
    installPlatformChrome(app);
    installAuthFlow(app);
    installScreenWake(app);
    installVideoPlayer(app);
    installAppUpdate(app);
    installShare(app);
    const downloads = settled(() => installDownloads(app));
    // The holder goes in first so placements set up before a slow implementation answers still update.
    provideAppPromoHolder(app);
    void settled(() => installAppPromo(app));
    return downloads;
}

/** Runs an optional installer, logging a failure, thrown or rejected, so it cannot stop the launch. */
function settled(install: () => void | Promise<void>): Promise<void> {
    try {
        return Promise.resolve(install()).catch((error: unknown) => console.error(error));
    } catch (error) {
        console.error(error);
        return Promise.resolve();
    }
}

export const plugins = {
    demoBanner: { install: installDemoBanner, DemoBannerKey },
    platformChrome: { install: installPlatformChrome, PlatformChromeKey },
    authFlow: { install: installAuthFlow, AuthFlowKey },
    screenWake: { install: installScreenWake, ScreenWakeKey },
    videoPlayer: { install: installVideoPlayer, VideoPlayerKey },
    appUpdate: { install: installAppUpdate, AppUpdateKey },
    share: { install: installShare, ShareKey },
    downloads: { install: installDownloads, DownloadsKey },
    appPromo: { install: installAppPromo, AppPromoKey },
} as const;

export { installDemoBanner, DemoBannerKey };
export { installPlatformChrome, PlatformChromeKey };
export { installAuthFlow, AuthFlowKey };
export { installScreenWake, ScreenWakeKey };
export { installVideoPlayer, VideoPlayerKey };
export { installAppUpdate, AppUpdateKey };
export { installShare, ShareKey };
export { installDownloads, DownloadsKey };
export { installAppPromo, AppPromoKey };
export type { DemoBannerService } from "@/build-time/contracts/demo-banner/contract";
export type { PlatformChromeService } from "@/build-time/contracts/platform-chrome/contract";
export type { AuthFlowService } from "@/build-time/contracts/auth-flow/contract";
export type { ScreenWakeService } from "@/build-time/contracts/screen-wake/contract";
export type { VideoPlayerService } from "@/build-time/contracts/video-player/contract";
export type { AppUpdateService } from "@/build-time/contracts/app-update/contract";
export type { ShareService } from "@/build-time/contracts/share/contract";
export type { DownloadsService } from "@/build-time/contracts/downloads/contract";
export type { AppPromoService } from "@/build-time/contracts/app-promo/contract";

/**
 * Vue `app.use()` entry that registers injectable services from the active build target. It drops the answer of
 * {@link installPlugins}; a caller that must wait for it calls that instead.
 */
export const appPluginsManager = {
    install(app: App) {
        void installPlugins(app);
    },
};
