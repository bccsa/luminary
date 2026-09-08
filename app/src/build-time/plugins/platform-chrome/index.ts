import type { App } from "vue";
import { providePlatformChrome } from "./provide";
import { WebPlatformChromeService } from "./platform-chrome-web";

export function installPlatformChrome(app: App): void {
    providePlatformChrome(app, new WebPlatformChromeService());
}

export { PlatformChromeKey } from "@/build-time/contracts/platform-chrome/token";
export type { PlatformChromeService } from "@/build-time/contracts/platform-chrome/contract";
