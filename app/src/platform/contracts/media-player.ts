import type { Component } from "vue";

export type MediaPlayerState = {
    status: "idle" | "loading" | "playing" | "paused";
    isPlaying: boolean;
    currentTimeSeconds: number;
    durationSeconds: number;
    playbackRate: number;
}

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
    getState(): MediaPlayerState;
    onStateChange(cb: (state: MediaPlayerState) => void): () => void;
}
