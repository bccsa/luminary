import type { Component } from "vue";
import type { MediaPlayerService, MediaPlayerState } from "@/build-time/contracts/media-player/contract";
import { mediaPlayerErrorFromElement } from "./mediaPlayerError";

/**
 * Browser {@link MediaPlayerService}: drives playback via an {@link HTMLAudioElement}
 * and mirrors its state into {@link MediaPlayerState} for subscribers.
 */
export class WebMediaPlayerService implements MediaPlayerService {
    readonly supportsBackgroundPlayback = false;
    private readonly playerComponent: Component;
    private audioElement: HTMLAudioElement | null = null;
    private listeners = new Set<(state: MediaPlayerState) => void>();
    private readonly state: MediaPlayerState = {
        status: "idle",
        isPlaying: false,
        currentTimeSeconds: 0,
        durationSeconds: 0,
        playbackRate: 1,
        volume: 1,
        isMuted: false,
        error: null,
    };

    private readonly syncStateFromElement = () => {
        if (!this.audioElement) return;

        this.state.isPlaying = !this.audioElement.paused;
        this.state.currentTimeSeconds = this.audioElement.currentTime || 0;
        this.state.durationSeconds = Number.isFinite(this.audioElement.duration) ? this.audioElement.duration : 0;
        this.state.playbackRate = this.audioElement.playbackRate || 1;
        this.state.volume = this.audioElement.volume;
        this.state.isMuted = this.audioElement.muted;
        this.state.status = this.state.isPlaying ? "playing" : "paused";
        if (this.state.isPlaying) {
            this.state.error = null;
        }
        this.emit();
    };

    private readonly handleWaiting = () => {
        if (!this.audioElement) return;
        this.state.status = "loading";
        this.emit();
    };

    private readonly handleLoadStart = () => {
        this.state.error = null;
        this.state.status = "loading";
        this.emit();
    };

    private readonly handleError = (errorEvent: Event) => {
        if (!this.audioElement) return;

        this.state.isPlaying = false;
        this.state.status = "paused";
        this.state.error = mediaPlayerErrorFromElement(this.audioElement);
        this.emit();
        console.error("Audio error:", this.audioElement.error, errorEvent);
    };

    constructor(playerComponent: Component) {
        this.playerComponent = playerComponent;
    }

    getGlobalAudioPlayerComponent(): Component {
        return this.playerComponent;
    }

    attachAudioElement(audioElement: HTMLAudioElement): void {
        if (this.audioElement === audioElement) return;

        this.detachAudioElement();

        this.audioElement = audioElement;
        this.audioElement.addEventListener("play", this.syncStateFromElement);
        this.audioElement.addEventListener("pause", this.syncStateFromElement);
        this.audioElement.addEventListener("timeupdate", this.syncStateFromElement);
        this.audioElement.addEventListener("loadedmetadata", this.syncStateFromElement);
        this.audioElement.addEventListener("ratechange", this.syncStateFromElement);
        this.audioElement.addEventListener("volumechange", this.syncStateFromElement);
        this.audioElement.addEventListener("playing", this.syncStateFromElement);
        this.audioElement.addEventListener("ended", this.syncStateFromElement);
        this.audioElement.addEventListener("waiting", this.handleWaiting);
        this.audioElement.addEventListener("loadstart", this.handleLoadStart);
        this.audioElement.addEventListener("error", this.handleError);
        this.syncStateFromElement();
    }

    detachAudioElement(audioElement?: HTMLAudioElement): void {
        if (!this.audioElement) return;
        if (audioElement && audioElement !== this.audioElement) return;

        this.audioElement.removeEventListener("play", this.syncStateFromElement);
        this.audioElement.removeEventListener("pause", this.syncStateFromElement);
        this.audioElement.removeEventListener("timeupdate", this.syncStateFromElement);
        this.audioElement.removeEventListener("loadedmetadata", this.syncStateFromElement);
        this.audioElement.removeEventListener("ratechange", this.syncStateFromElement);
        this.audioElement.removeEventListener("volumechange", this.syncStateFromElement);
        this.audioElement.removeEventListener("playing", this.syncStateFromElement);
        this.audioElement.removeEventListener("ended", this.syncStateFromElement);
        this.audioElement.removeEventListener("waiting", this.handleWaiting);
        this.audioElement.removeEventListener("loadstart", this.handleLoadStart);
        this.audioElement.removeEventListener("error", this.handleError);
        this.audioElement = null;
    }

    async play(): Promise<void> {
        if (!this.audioElement) return;
        await this.audioElement.play();
    }

    pause(): void {
        this.audioElement?.pause();
    }

    seekTo(seconds: number): void {
        if (!this.audioElement) return;
        this.audioElement.currentTime = Math.max(0, seconds);
        this.syncStateFromElement();
    }

    seekBy(seconds: number): void {
        if (!this.audioElement) return;
        this.seekTo(this.audioElement.currentTime + seconds);
    }

    setPlaybackRate(rate: number): void {
        if (!this.audioElement) return;
        this.audioElement.playbackRate = rate;
        this.syncStateFromElement();
    }

    setVolume(volume: number): void {
        if (!this.audioElement) return;

        const clamped = Math.max(0, Math.min(1, volume));
        this.audioElement.volume = clamped;
        if (clamped > 0 && this.audioElement.muted) {
            this.audioElement.muted = false;
        }
        this.syncStateFromElement();
    }

    setMuted(muted: boolean): void {
        if (!this.audioElement) return;
        this.audioElement.muted = muted;
        this.syncStateFromElement();
    }

    clearError(): void {
        if (!this.state.error) return;
        this.state.error = null;
        this.emit();
    }

    getState(): MediaPlayerState {
        return {
            ...this.state,
            error: this.state.error ? { ...this.state.error } : null,
        };
    }

    onStateChange(cb: (state: MediaPlayerState) => void): () => void {
        this.listeners.add(cb);
        cb(this.getState());
        return () => this.listeners.delete(cb);
    }

    private emit(): void {
        const snapshot = this.getState();
        this.listeners.forEach((cb) => cb(snapshot));
    }
}
