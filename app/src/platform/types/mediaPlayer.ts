import type { Component, InjectionKey } from "vue";
import type { ContentDto } from "luminary-shared";

export type VideoPlayerProps = {
    content: ContentDto;
    audioTrackLanguage: string | null | undefined;
};

export type PlatformCapabilities = {
    playback: {
        nativePlayback: boolean;
        nativeFullscreen: boolean;
        pictureInPicture: boolean;
        backgroundAudio: boolean;
        seekControl: boolean;
        playbackRateControl: boolean;
    };
    tracks: {
        audioTrackSelection: boolean;
    };
    offline: {
        downloads: boolean;
        progressTracking: boolean;
        deleteDownloadedMedia: boolean;
    };
};

export type MediaPlayerService = {
    VideoPlayer: Component;
    capabilities: PlatformCapabilities;
};

export const MediaPlayerKey: InjectionKey<MediaPlayerService> = Symbol("media-player");
