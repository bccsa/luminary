import type { InjectionKey, Component } from "vue";
import type { ContentDto } from "luminary-shared";

/**
 * Props that every VideoPlayer implementation must accept.
 * Both web and native implementations are bound to this contract.
 */
export type VideoPlayerProps = {
    content: ContentDto;
    language: string | null | undefined;
};

/**
 * Capability flags declared by each platform implementation.
 * Consumer components can gate platform-specific UI behind these.
 */
export type PlatformCapabilities = {
    backgroundAudio: boolean;
    offlineDownloads: boolean;
    nativeFullscreen: boolean;
};

/**
 * The media player service that every platform plugin provides.
 * Add more swappable components here as the system grows
 * (e.g. AudioPlayer, DownloadManager).
 */
export type MediaPlayerService = {
    VideoPlayer: Component;
    capabilities: PlatformCapabilities;
};

/**
 * Typed injection key for the MediaPlayerService.
 * Import this in both the plugin (provide) and composables (inject).
 */
export const MediaPlayerKey: InjectionKey<MediaPlayerService> = Symbol("media-player");
