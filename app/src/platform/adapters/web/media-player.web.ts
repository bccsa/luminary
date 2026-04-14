import type { Component } from "vue";
import AudioPlayer from "@/components/content/AudioPlayer.vue";
import type { MediaPlayerService, MediaPlayerState } from "@/platform/contracts/media-player";

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
    };

    /**
     * Copies the bound audio element's playback fields into the in-memory mirror state and notifies listeners.
     */
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

    /**
     * Marks status as loading while the element is buffering.
     */
    private readonly handleWaiting = () => {
        this.state.status = "loading";
        this.emit();
    };

    /**
     * @param playerComponent - Vue component used as the global audio player shell (defaults to {@link AudioPlayer}).
     */
    constructor(playerComponent: Component = AudioPlayer) {
        this.playerComponent = playerComponent;
    }

    /**
     * @returns The Vue component that should host the global audio UI.
     */
    getGlobalAudioPlayerComponent(): Component {
        return this.playerComponent;
    }

    /**
     * Binds this service to an {@link HTMLAudioElement}, wiring DOM events so state stays in sync.
     *
     * @param audioElement - Element to own; replaces any previous binding.
     */
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

    /**
     * Removes listeners from the current element. If `audioElement` is passed, only detaches when it matches the bound element.
     *
     * @param audioElement - Optional; skip detach when it is not the active element.
     */
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

    /**
     * Starts or resumes playback on the bound element (no-op if none attached).
     */
    async play(): Promise<void> {
        if (!this.audioElement) {
            return;
        }
        await this.audioElement.play();
    }

    /**
     * Pauses the bound element when present.
     */
    pause(): void {
        this.audioElement?.pause();
    }

    /**
     * Sets absolute playback position in seconds (clamped to >= 0).
     *
     * @param seconds - Target time in seconds.
     */
    seekTo(seconds: number): void {
        if (!this.audioElement) {
            return;
        }
        this.audioElement.currentTime = Math.max(0, seconds);
        this.syncStateFromElement();
    }

    /**
     * Seeks relative to the current time.
     *
     * @param seconds - Delta in seconds (may be negative).
     */
    seekBy(seconds: number): void {
        if (!this.audioElement) {
            return;
        }
        this.seekTo(this.audioElement.currentTime + seconds);
    }

    /**
     * Updates the element playback rate and refreshes mirrored state.
     *
     * @param rate - Playback rate multiplier.
     */
    setPlaybackRate(rate: number): void {
        if (!this.audioElement) {
            return;
        }
        this.audioElement.playbackRate = rate;
        this.syncStateFromElement();
    }

    /**
     * @returns A shallow copy of the current mirrored playback state.
     */
    getState(): MediaPlayerState {
        return { ...this.state };
    }

    /**
     * Subscribes to playback state updates. The callback runs immediately with the current state.
     *
     * @param cb - Called with a fresh snapshot whenever state changes.
     * @returns Unsubscribe function.
     */
    onStateChange(cb: (state: MediaPlayerState) => void): () => void {
        this.listeners.add(cb);
        cb(this.getState());
        return () => this.listeners.delete(cb);
    }

    /**
     * Pushes the current state snapshot to all subscribers.
     */
    private emit(): void {
        const snapshot = this.getState();
        this.listeners.forEach((cb) => cb(snapshot));
    }
}
