import type { App } from "vue";
import { ScreenWakeKey } from "@/build-time/contracts/screen-wake/token";
import { WebScreenWakeService } from "./screen-wake-web";

export function installScreenWake(app: App): void {
    app.provide(ScreenWakeKey, new WebScreenWakeService());
}

export { ScreenWakeKey } from "@/build-time/contracts/screen-wake/token";
export type { ScreenWakeService } from "@/build-time/contracts/screen-wake/contract";
