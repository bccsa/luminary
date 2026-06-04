import type { Component } from "vue";

export type MediaPlayerError = {
    message: string;
    code?: number;
    retryable: boolean;
};

export type MediaPlayerState = {
    status: "idle" | "loading" | "playing" | "paused";
    isPlaying: boolean;
    currentTimeSeconds: number;
    durationSeconds: number;
    playbackRate: number;
    volume: number;
    isMuted: boolean;
    error: MediaPlayerError | null;
};

export type NowPlayingInfo = {
    title: string;
    artist?: string;
    artworkUrl?: string;
    duration?: number;
};

export type MediaPlayerService = {
    readonly supportsBackgroundPlayback: boolean;
    getGlobalAudioPlayerComponent(): Component;
    attachAudioElement(audioElement: HTMLAudioElement): void;
    detachAudioElement(audioElement?: HTMLAudioElement): void;
    play(): Promise<void>;
    pause(): void;
    seekTo(seconds: number): void;
    seekBy(seconds: number): void;
    setPlaybackRate(rate: number): void;
    setVolume(volume: number): void;
    setMuted(muted: boolean): void;
    clearError(): void;
    getState(): MediaPlayerState;
    onStateChange(cb: (state: MediaPlayerState) => void): () => void;
    setNowPlaying?(info: NowPlayingInfo): void;
};
