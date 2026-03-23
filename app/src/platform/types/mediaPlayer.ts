import type { InjectionKey, Component } from "vue";
import type { ContentDto } from "luminary-shared";

/**
 * Props that every VideoPlayer implementation must accept.
 * Both web and native implementations are bound to this contract.
 */
export type VideoPlayerProps = {
    content: ContentDto;
    audioTrackLanguage: string | null | undefined;
};

/**
 * Capability flags declared by each platform implementation.
 * Consumer components can gate platform-specific UI behind these flags
 * instead of checking the platform directly.
 */
export type PlatformCapabilities = {
    playback: {
        nativePlayback: boolean;
        nativeFullscreen: boolean;
        pictureInPicture: boolean;
        backgroundAudio: boolean;
    };
    tracks: {
        audioTrackSelection: boolean;
    };
    offline: {
        downloads: boolean;
    };
};

/**
 * The media player service registered by each platform plugin.
 */
export type MediaPlayerService = {
    VideoPlayer: Component;
    capabilities: PlatformCapabilities;
};

/**
 * Typed injection key for the MediaPlayerService.
 * Import this in both the plugin (provide) and the composable (inject).
 */
export const MediaPlayerKey: InjectionKey<MediaPlayerService> = Symbol("media-player");
