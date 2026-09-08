import { watch, type App } from "vue";
import { PlatformChromeKey } from "@/build-time/contracts/platform-chrome/token";
import type { PlatformChromeService } from "@/build-time/contracts/platform-chrome/contract";
import { useMobileChromeAutoHide } from "@/composables/useMobileChromeAutoHide";

/**
 * Provides the service and wires the coupling every build target shares:
 * the OS status bar steps aside together with the auto-hiding chrome.
 */
export function providePlatformChrome(app: App, service: PlatformChromeService): void {
    app.provide(PlatformChromeKey, service);
    const { hidden } = useMobileChromeAutoHide();
    watch(hidden, (value) => service.setStatusBarHidden(value));
}
