/**
 * The timeline under a finger: a tap does not move the video, it opens the way to scrub it. With frames that is the
 * strip of them; without, a thicker bar with a handle. Only a drag moves the playhead. The video holds still while
 * either is open, and they put themselves away a few seconds after the last touch, on a tap elsewhere or on play,
 * the video carrying on only if it was playing when they opened. The Android and iOS players keep the same rules.
 */

/** What a touch on the timeline has opened. */
export type TimelineScrubMode = "closed" | "strip" | "bar";

/** What the player has to do about it. */
export type TimelineScrubEffect =
    | { kind: "open"; mode: "strip" | "bar" }
    | { kind: "close" }
    | { kind: "pause" }
    | { kind: "play" }
    | { kind: "seek"; time: number };

/** How long after the last touch it closes on its own. */
export const TIMELINE_SCRUB_IDLE_MS = 5000;

export class TimelineScrub {
    private current: TimelineScrubMode = "closed";
    private resumeOnClose = false;
    private idle: ReturnType<typeof setTimeout> | undefined;

    constructor(private readonly onEffect: (effect: TimelineScrubEffect) => void) {}

    get mode(): TimelineScrubMode {
        return this.current;
    }

    get isOpen(): boolean {
        return this.current !== "closed";
    }

    /** A finger came down on the timeline or the strip: nothing closes under it. */
    touchBegan(): void {
        this.cancelIdle();
    }

    /** A tap on the timeline, which never moves the video. */
    tapped(framesReady: boolean, playing: boolean): void {
        this.openIfClosed(framesReady, playing);
        this.armIdle();
    }

    /** A drag on the timeline or the strip started. */
    dragBegan(framesReady: boolean, playing: boolean): void {
        this.openIfClosed(framesReady, playing);
        this.cancelIdle();
    }

    /** The drag let go at `time`: the one place the video moves. */
    dragEnded(time: number): void {
        this.onEffect({ kind: "seek", time });
        this.armIdle();
    }

    /** The drag was taken away from the finger without a decision: nothing moves. */
    dragCancelled(): void {
        this.armIdle();
    }

    /** A tap anywhere but the timeline and the strip. */
    tappedElsewhere(): void {
        this.close(true);
    }

    /** Play was asked for while open: it closes, and the video plays whether or not it was before. */
    playPressed(): void {
        if (!this.isOpen) return;
        this.resumeOnClose = true;
        this.close(true);
    }

    /** A new video, a change of layout, or the player going away: put away without touching playback. */
    reset(): void {
        this.close(false);
    }

    private openIfClosed(framesReady: boolean, playing: boolean): void {
        if (this.current !== "closed") return;
        this.resumeOnClose = playing;
        this.current = framesReady ? "strip" : "bar";
        this.onEffect({ kind: "open", mode: this.current });
        if (playing) this.onEffect({ kind: "pause" });
    }

    private armIdle(): void {
        this.cancelIdle();
        if (this.isOpen) this.idle = setTimeout(() => this.close(true), TIMELINE_SCRUB_IDLE_MS);
    }

    private cancelIdle(): void {
        if (this.idle !== undefined) clearTimeout(this.idle);
        this.idle = undefined;
    }

    private close(resume: boolean): void {
        this.cancelIdle();
        if (!this.isOpen) return;
        this.current = "closed";
        this.onEffect({ kind: "close" });
        if (resume && this.resumeOnClose) this.onEffect({ kind: "play" });
        this.resumeOnClose = false;
    }
}
