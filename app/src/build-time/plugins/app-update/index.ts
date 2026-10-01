import type { App } from "vue";
import { AppUpdateKey } from "@/build-time/contracts/app-update/token";
import { isPrerender } from "@/ssg/isPrerender";
import { WebAppUpdateService } from "./app-update-web";

export function installAppUpdate(app: App): void {
    const service = new WebAppUpdateService();
    // The SSG prerender has no running deploy to poll against, and an interval would run for
    // the whole build.
    if (!isPrerender()) service.start();
    app.provide(AppUpdateKey, service);
}

export { AppUpdateKey } from "@/build-time/contracts/app-update/token";
export type { AppUpdateService } from "@/build-time/contracts/app-update/contract";
