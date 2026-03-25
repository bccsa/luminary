import type { Component, InjectionKey } from "vue";
import type { ContentDto } from "luminary-shared";

/**
 * Props every AudioPlayer implementation must accept.
 *
 * The current web implementation (`components/content/AudioPlayer.vue`) uses
 * `defineModel("content")`, so consuming code should pass `content` via
 * `v-model:content` (recommended) or a plain `:content` prop.
 */
export type AudioPlayerProps = {
    content: ContentDto;
};

/**
 * Capability flags for audio playback. Keep this minimal and add flags only
 * when the UI needs to branch on them.
 */
export type AudioPlayerCapabilities = {
    /** True when audio continues after the app is backgrounded. */
    backgroundAudio: boolean;
    /** True when playback-rate selection (0.5×, 1.5×, …) is available. */
    playbackRateControl: boolean;
};

/**
 * The value that platform plugins must provide under AudioPlayerKey.
 */
export type AudioPlayerService = {
    /** The Vue component to render as the audio player. */
    AudioPlayer: Component;
    /** Feature flags for the current build environment. */
    capabilities: AudioPlayerCapabilities;
};

/**
 * Typed injection key for AudioPlayerService.
 */
export const AudioPlayerKey: InjectionKey<AudioPlayerService> = Symbol("audio-player");

