/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_APP_NAME: string;

    readonly VITE_WEB_ORIGIN?: string;

    readonly VITE_PUBLIC_ORGANIZATION_NAME?: string;

    readonly VITE_PUBLIC_LOGO_PATH?: string;

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

declare module "virtual:platform-chrome" {
    import type { App } from "vue";
    import type { InjectionKey } from "vue";
    import type { PlatformChromeService } from "@/build-time/contracts/platform-chrome/contract";

    export const PlatformChromeKey: InjectionKey<PlatformChromeService>;
    export function installPlatformChrome(app: App): void;
}

declare module "virtual:auth-flow" {
    import type { App } from "vue";
    import type { InjectionKey } from "vue";
    import type { AuthFlowService } from "@/build-time/contracts/auth-flow/contract";

    export const AuthFlowKey: InjectionKey<AuthFlowService>;
    export function installAuthFlow(app: App): void;
}

declare module "virtual:app-lifecycle" {
    export function notifyUiReady(): void;
}
