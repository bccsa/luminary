import type { App, Component } from "vue";
import { DemoBannerKey } from "@/build-time/contracts/demo-banner/token";
import type { DemoBannerService } from "@/build-time/contracts/demo-banner/contract";
import DemoBanner from "./DemoBanner.vue";
import { WebDemoBannerService } from "./demo-banner-web";

export interface DemoBannerInstallOptions {
    bannerComponent?: Component;
}

export function createDemoBannerService(options: DemoBannerInstallOptions = {}): DemoBannerService {
    return new WebDemoBannerService(options.bannerComponent ?? DemoBanner);
}

export function installDemoBanner(app: App, options: DemoBannerInstallOptions = {}): void {
    app.provide(DemoBannerKey, createDemoBannerService(options));
}

export { DemoBannerKey } from "@/build-time/contracts/demo-banner/token";
export type { DemoBannerService } from "@/build-time/contracts/demo-banner/contract";
