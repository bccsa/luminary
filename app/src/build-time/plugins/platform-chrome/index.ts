import { watch, type App } from "vue";
import { PlatformChromeKey } from "@/build-time/contracts/platform-chrome/token";
import type { PlatformChromeService } from "@/build-time/contracts/platform-chrome/contract";
import { isNativeApp } from "@/util/inAppBrowser";
import { useMobileChromeAutoHide } from "@/composables/useMobileChromeAutoHide";
import { WebPlatformChromeService } from "./platform-chrome-web";
import { NativePlatformChromeService } from "./platform-chrome-native";

/**
 * The same SPA bundle runs in browsers and inside the packaged app, so the
 * platform is a runtime property rather than a build target — the service is
 * selected here instead of via the virtual-module map.
 */
export function createPlatformChromeService(): PlatformChromeService {
    return isNativeApp() ? new NativePlatformChromeService() : new WebPlatformChromeService();
}

export function installPlatformChrome(app: App): void {
    const service = createPlatformChromeService();
    app.provide(PlatformChromeKey, service);

    // The OS status bar steps aside together with the auto-hiding chrome.
    const { hidden } = useMobileChromeAutoHide();
    watch(hidden, (value) => service.setStatusBarHidden(value));
}

export { PlatformChromeKey } from "@/build-time/contracts/platform-chrome/token";
export type { PlatformChromeService } from "@/build-time/contracts/platform-chrome/contract";
