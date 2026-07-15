/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_APP_NAME: string;

    readonly VITE_API_URL: string;

    readonly VITE_SENTRY_DSN: string;

}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

declare const __APP_BUILD_ID__: string;

declare module "virtual:demo-banner" {
    import type { App, Component } from "vue";
    import type { InjectionKey } from "vue";
    import type { DemoBannerService } from "@/build-time/contracts/demo-banner/contract";

    export const DemoBannerKey: InjectionKey<DemoBannerService>;
    export function installDemoBanner(
        app: App,
        options?: { bannerComponent?: Component },
    ): void;
}
