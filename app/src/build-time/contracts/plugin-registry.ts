import type { App } from "vue";
import { installDemoBanner, DemoBannerKey } from "virtual:demo-banner";
import { installPlatformChrome, PlatformChromeKey } from "virtual:platform-chrome";
import { installAuthFlow, AuthFlowKey } from "virtual:auth-flow";
import { installScreenWake, ScreenWakeKey } from "virtual:screen-wake";

/**
 * Calls each `install*` from resolved `virtual:*` modules so build-target services
 * are `provide`d on the app.
 *
 * Only register services that are swapped via Vite virtual modules.
 * App bootstrap concerns stay in `main.ts`.
 */
export function installPlugins(app: App): void {
    installDemoBanner(app);
    installPlatformChrome(app);
    installAuthFlow(app);
    installScreenWake(app);
}

export const plugins = {
    demoBanner: { install: installDemoBanner, DemoBannerKey },
    platformChrome: { install: installPlatformChrome, PlatformChromeKey },
    authFlow: { install: installAuthFlow, AuthFlowKey },
    screenWake: { install: installScreenWake, ScreenWakeKey },
} as const;

export { installDemoBanner, DemoBannerKey };
export { installPlatformChrome, PlatformChromeKey };
export { installAuthFlow, AuthFlowKey };
export { installScreenWake, ScreenWakeKey };
export type { DemoBannerService } from "@/build-time/contracts/demo-banner/contract";
export type { PlatformChromeService } from "@/build-time/contracts/platform-chrome/contract";
export type { AuthFlowService } from "@/build-time/contracts/auth-flow/contract";
export type { ScreenWakeService } from "@/build-time/contracts/screen-wake/contract";

/** Vue `app.use()` entry that registers injectable services from the active build target. */
export const appPluginsManager = {
    install(app: App) {
        installPlugins(app);
    },
};
