import type { App } from "vue";
import { AppUpdateKey } from "@/build-time/contracts/app-update/token";
import { WebAppUpdateService } from "./app-update-web";

export function installAppUpdate(app: App): void {
    app.provide(AppUpdateKey, new WebAppUpdateService());
}

export { AppUpdateKey } from "@/build-time/contracts/app-update/token";
export type { AppUpdateService } from "@/build-time/contracts/app-update/contract";
