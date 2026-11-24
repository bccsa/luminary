import { describe, expect, it } from "vitest";
import {
    SPIN_MIN_SPEED,
    SPIN_STOP_SPEED,
    SPIN_TIME_CONSTANT_MS,
    StripSpin,
    releaseVelocity,
    spinDuration,
    spinOffset,
} from "../ui/stripSpin";

function fakeClock() {
    let time = 0;
    let next: (() => void) | null = null;
    let handles = 0;
    return {
        clock: {
            now: () => time,
            frame: (callback: () => void) => {
                next = callback;
                return ++handles;
            },
            cancel: () => {
                next = null;
            },
        },
        advance(ms: number) {
            time += ms;
        },
        /** Runs frames 16 ms apart until none is asked for. */
        runFrames(limit = 1000) {
            for (let i = 0; i < limit && next; i++) {
                time += 16;
                const callback = next;
                next = null;
                callback();
            }
        },
        get pending() {
            return next !== null;
        },
    };
}

describe("spin arithmetic", () => {
    it("travels velocity × time constant in all, in the direction flicked", () => {
        expect(spinOffset(1000, 0)).toBe(0);
        expect(spinOffset(1000, 1e9)).toBeCloseTo((1000 * SPIN_TIME_CONSTANT_MS) / 1000);
        expect(spinOffset(-1000, 1e9)).toBeCloseTo((-1000 * SPIN_TIME_CONSTANT_MS) / 1000);
        expect(spinOffset(1000, 100)).toBeLessThan(spinOffset(1000, 200));
    });

    it("lasts until it slows to the stop speed, and not at all below the minimum", () => {
        expect(spinDuration(SPIN_MIN_SPEED - 1)).toBe(0);
        expect(spinDuration(0)).toBe(0);
        const duration = spinDuration(-2000);
        expect(duration).toBeGreaterThan(0);
        expect(2000 * Math.exp(-duration / SPIN_TIME_CONSTANT_MS)).toBeCloseTo(SPIN_STOP_SPEED);
    });

    it("reads the finger's speed over its last moves", () => {
        const samples = [
            { x: 0, t: 0 },
            { x: 100, t: 200 },
            { x: 150, t: 250 },
            { x: 200, t: 300 },
        ];
        // The first move is outside the window: 100 px in 100 ms.
        expect(releaseVelocity(samples, 300)).toBeCloseTo(1000);
    });

    it("is still when the finger stopped before lifting", () => {
        const samples = [
            { x: 0, t: 0 },
            { x: 100, t: 50 },
        ];
        expect(releaseVelocity(samples, 200)).toBe(0);
        expect(releaseVelocity([], 0)).toBe(0);
    });
});

describe("StripSpin", () => {
    function flick(spin: StripSpin, fake: ReturnType<typeof fakeClock>, pxPerFrame: number) {
        spin.press(0);
        for (let i = 1; i <= 5; i++) {
            fake.advance(16);
            spin.move(i * pxPerFrame);
        }
    }

    it("spins on after a flick and ends where it has slowed down", () => {
        const fake = fakeClock();
        const spin = new StripSpin(fake.clock);
        flick(spin, fake, 40);
        const offsets: number[] = [];
        let ended = 0;
        expect(
            spin.release(
                (offset) => (offsets.push(offset), true),
                () => ended++,
            ),
        ).toBe(true);
        expect(spin.spinning).toBe(true);
        fake.runFrames();
        expect(ended).toBe(1);
        expect(spin.spinning).toBe(false);
        expect(offsets.length).toBeGreaterThan(10);
        // Rightwards, ever slower.
        expect(offsets.every((offset, i) => i === 0 || offset >= offsets[i - 1])).toBe(true);
        expect(offsets[offsets.length - 1]).toBeGreaterThan(400);
    });

    it("stops where the finger lifts after a slow drag", () => {
        const fake = fakeClock();
        const spin = new StripSpin(fake.clock);
        flick(spin, fake, 2);
        expect(
            spin.release(
                () => true,
                () => {},
            ),
        ).toBe(false);
        expect(fake.pending).toBe(false);
    });

    it("ends early when the strip reaches an end", () => {
        const fake = fakeClock();
        const spin = new StripSpin(fake.clock);
        flick(spin, fake, -40);
        let moves = 0;
        let ended = 0;
        spin.release(
            () => ++moves < 3,
            () => ended++,
        );
        fake.runFrames();
        expect(moves).toBe(3);
        expect(ended).toBe(1);
    });

    it("is caught by the next press, which does not end it", () => {
        const fake = fakeClock();
        const spin = new StripSpin(fake.clock);
        flick(spin, fake, 40);
        let ended = 0;
        spin.release(
            () => true,
            () => ended++,
        );
        fake.runFrames(3);
        expect(spin.press(10)).toBe(true);
        expect(spin.spinning).toBe(false);
        fake.runFrames();
        expect(ended).toBe(0);
        expect(spin.press(10)).toBe(false);
    });
});
