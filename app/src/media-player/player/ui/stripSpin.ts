/**
 * A strip of frames flicked hard keeps sliding after the finger lifts and slows to a stop, as a list does, so a
 * long way through the video takes one swipe instead of many. The Android and iOS strips use the same numbers.
 */

/** Below this release speed, in px/s, the strip stops where the finger lifts. */
export const SPIN_MIN_SPEED = 300;
/** The spin ends once it has slowed to this, in px/s: any slower is not visibly moving. */
export const SPIN_STOP_SPEED = 20;
/** How quickly it slows: the speed falls to about a third every this many ms. */
export const SPIN_TIME_CONSTANT_MS = 325;
/** The finger's speed is read over its last moves within this window, in ms. */
export const SPIN_SAMPLE_MS = 100;
/** A finger that held still this long before lifting was placing a frame, not flicking. */
export const SPIN_STALE_MS = 50;

/** How far, in px, a spin released at `velocity` px/s has carried the strip after `elapsedMs`. */
export function spinOffset(velocity: number, elapsedMs: number): number {
    const tau = SPIN_TIME_CONSTANT_MS;
    return ((velocity * tau) / 1000) * (1 - Math.exp(-Math.max(0, elapsedMs) / tau));
}

/** How long, in ms, a spin released at `velocity` px/s lasts; 0 when it is too slow to spin. */
export function spinDuration(velocity: number): number {
    const speed = Math.abs(velocity);
    if (!(speed >= SPIN_MIN_SPEED)) return 0;
    return SPIN_TIME_CONSTANT_MS * Math.log(speed / SPIN_STOP_SPEED);
}

/** The finger's speed in px/s at `now`, from `samples` of its x over time (oldest first); 0 when it had stopped. */
export function releaseVelocity(samples: readonly { x: number; t: number }[], now: number): number {
    const last = samples[samples.length - 1];
    if (!last || now - last.t > SPIN_STALE_MS) return 0;
    const first = samples.find((sample) => last.t - sample.t <= SPIN_SAMPLE_MS) ?? last;
    const dt = last.t - first.t;
    return dt > 0 ? ((last.x - first.x) / dt) * 1000 : 0;
}

interface SpinClock {
    now: () => number;
    frame: (callback: () => void) => number;
    cancel: (handle: number) => void;
}

const browserClock: SpinClock = {
    now: () => performance.now(),
    frame: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => cancelAnimationFrame(handle),
};

/**
 * One strip's spin: it follows the finger's moves, and on release runs on by itself. `onMove` is given the px
 * travelled since the release and returns false to stop (the strip reached an end); `onEnd` follows either way.
 */
export class StripSpin {
    private samples: { x: number; t: number }[] = [];
    private handle: number | null = null;

    constructor(private readonly clock: SpinClock = browserClock) {}

    get spinning(): boolean {
        return this.handle !== null;
    }

    /** A finger came down: a running spin stops under it, without ending. Returns whether one was caught. */
    press(x: number): boolean {
        const caught = this.stop();
        this.samples = [{ x, t: this.clock.now() }];
        return caught;
    }

    move(x: number): void {
        const t = this.clock.now();
        this.samples.push({ x, t });
        while (this.samples.length > 2 && t - this.samples[1].t > SPIN_SAMPLE_MS)
            this.samples.shift();
    }

    /** The finger lifted: spins when it was flicked, and returns whether it did. */
    release(onMove: (offset: number) => boolean, onEnd: () => void): boolean {
        const start = this.clock.now();
        const velocity = releaseVelocity(this.samples, start);
        this.samples = [];
        const duration = spinDuration(velocity);
        if (duration <= 0) return false;
        const step = () => {
            const elapsed = Math.min(duration, this.clock.now() - start);
            if (!onMove(spinOffset(velocity, elapsed)) || elapsed >= duration) {
                this.handle = null;
                onEnd();
                return;
            }
            this.handle = this.clock.frame(step);
        };
        this.handle = this.clock.frame(step);
        return true;
    }

    /** Stops a spin without ending it. Returns whether one was running. */
    stop(): boolean {
        if (this.handle === null) return false;
        this.clock.cancel(this.handle);
        this.handle = null;
        return true;
    }
}
