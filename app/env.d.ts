/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_APP_NAME: string;

    readonly VITE_API_URL: string;

    readonly VITE_SENTRY_DSN: string;

}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

declare module "virtual:media-player" {
    import type { App, Component } from "vue";
    import type { InjectionKey } from "vue";
    import type { MediaPlayerService } from "@/build-time/contracts/media-player/contract";

    export const MediaPlayerKey: InjectionKey<MediaPlayerService>;
    export function installMediaPlayer(
        app: App,
        options?: { audioPlayerComponent?: Component },
    ): void;
}
