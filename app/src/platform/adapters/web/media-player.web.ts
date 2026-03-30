import type { Component } from "vue";
import AudioPlayer from "@/components/content/AudioPlayer.vue";
import type { MediaPlayerService, MediaPlayerState } from "@/platform/contracts/media-player";

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
    };

    private readonly syncStateFromElement = () => {
        if (!this.audioElement) {
            return;
        }

        this.state.isPlaying = !this.audioElement.paused;
        this.state.currentTimeSeconds = this.audioElement.currentTime || 0;
        this.state.durationSeconds = Number.isFinite(this.audioElement.duration)
            ? this.audioElement.duration
            : 0;
        this.state.playbackRate = this.audioElement.playbackRate || 1;
        this.state.status = this.state.isPlaying ? "playing" : "paused";
        this.emit();
    };

    private readonly handleWaiting = () => {
        this.state.status = "loading";
        this.emit();
    };

    constructor(playerComponent: Component = AudioPlayer) {
        this.playerComponent = playerComponent;
    }

    getGlobalAudioPlayerComponent(): Component {
        return this.playerComponent;
    }

    attachAudioElement(audioElement: HTMLAudioElement): void {
        if (this.audioElement === audioElement) {
            return;
        }

        this.detachAudioElement();
        this.audioElement = audioElement;

        audioElement.addEventListener("play", this.syncStateFromElement);
        audioElement.addEventListener("pause", this.syncStateFromElement);
        audioElement.addEventListener("timeupdate", this.syncStateFromElement);
        audioElement.addEventListener("loadedmetadata", this.syncStateFromElement);
        audioElement.addEventListener("ratechange", this.syncStateFromElement);
        audioElement.addEventListener("playing", this.syncStateFromElement);
        audioElement.addEventListener("ended", this.syncStateFromElement);
        audioElement.addEventListener("waiting", this.handleWaiting);

        this.syncStateFromElement();
    }

    detachAudioElement(audioElement?: HTMLAudioElement): void {
        if (!this.audioElement) {
            return;
        }
        if (audioElement && audioElement !== this.audioElement) {
            return;
        }

        this.audioElement.removeEventListener("play", this.syncStateFromElement);
        this.audioElement.removeEventListener("pause", this.syncStateFromElement);
        this.audioElement.removeEventListener("timeupdate", this.syncStateFromElement);
        this.audioElement.removeEventListener("loadedmetadata", this.syncStateFromElement);
        this.audioElement.removeEventListener("ratechange", this.syncStateFromElement);
        this.audioElement.removeEventListener("playing", this.syncStateFromElement);
        this.audioElement.removeEventListener("ended", this.syncStateFromElement);
        this.audioElement.removeEventListener("waiting", this.handleWaiting);
        this.audioElement = null;
    }

    async play(): Promise<void> {
        if (!this.audioElement) {
            return;
        }
        await this.audioElement.play();
    }

    pause(): void {
        this.audioElement?.pause();
    }

    seekTo(seconds: number): void {
        if (!this.audioElement) {
            return;
        }
        this.audioElement.currentTime = Math.max(0, seconds);
        this.syncStateFromElement();
    }

    seekBy(seconds: number): void {
        if (!this.audioElement) {
            return;
        }
        this.seekTo(this.audioElement.currentTime + seconds);
    }

    setPlaybackRate(rate: number): void {
        if (!this.audioElement) {
            return;
        }
        this.audioElement.playbackRate = rate;
        this.syncStateFromElement();
    }

    getState(): MediaPlayerState {
        return { ...this.state };
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
