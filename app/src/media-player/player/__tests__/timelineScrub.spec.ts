import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimelineScrub, type TimelineScrubEffect } from "../ui/timelineScrub";

/** Mirrors the native players' TimelineScrub tests. */
describe("TimelineScrub: two touches to scrub", () => {
    let effects: TimelineScrubEffect[];
    let scrub: TimelineScrub;

    beforeEach(() => {
        vi.useFakeTimers();
        effects = [];
        scrub = new TimelineScrub((effect) => effects.push(effect));
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    const open = (mode: "strip" | "bar") => ({ kind: "open", mode }) as const;
    const pause = { kind: "pause" } as const;
    const play = { kind: "play" } as const;
    const close = { kind: "close" } as const;

    it("a tap opens the strip without moving the video or holding it", () => {
        scrub.tapped(true);
        expect(scrub.mode).toBe("strip");
        expect(effects).toEqual([open("strip")]);
    });

    it("without frames a tap opens the thick bar instead", () => {
        scrub.tapped(false);
        expect(scrub.mode).toBe("bar");
        expect(effects).toEqual([open("bar")]);
    });

    it("a drag holds the video under the finger, and it plays on from where the finger let go", () => {
        scrub.dragBegan(true, true);
        expect(effects).toEqual([open("strip"), pause]);
        scrub.dragEnded(42);
        expect(scrub.isOpen).toBe(true);
        expect(effects).toEqual([open("strip"), pause, { kind: "seek", time: 42 }, play]);
    });

    it("a video that was paused stays paused after a drag", () => {
        scrub.dragBegan(true, false);
        scrub.dragEnded(10);
        expect(effects).toEqual([open("strip"), { kind: "seek", time: 10 }]);
    });

    it("a drag taken away from the finger plays on without moving", () => {
        scrub.dragBegan(true, true);
        scrub.dragCancelled();
        expect(effects).toEqual([open("strip"), pause, play]);
    });

    it("a drag reported again while under way holds and plays on once", () => {
        scrub.dragBegan(true, true);
        scrub.dragBegan(true, false);
        scrub.dragEnded(5);
        expect(effects).toEqual([open("strip"), pause, { kind: "seek", time: 5 }, play]);
    });

    it("it closes five seconds after the last touch, leaving playback alone", () => {
        scrub.tapped(true);
        vi.advanceTimersByTime(4900);
        expect(scrub.isOpen).toBe(true);
        vi.advanceTimersByTime(100);
        expect(scrub.isOpen).toBe(false);
        expect(effects).toEqual([open("strip"), close]);
    });

    it("a finger on it keeps it open, and the count starts again when it lifts", () => {
        scrub.tapped(true);
        vi.advanceTimersByTime(2000);
        scrub.dragBegan(true, true);
        vi.advanceTimersByTime(10000);
        expect(scrub.isOpen).toBe(true);
        scrub.dragEnded(5);
        vi.advanceTimersByTime(4900);
        expect(scrub.isOpen).toBe(true);
        vi.advanceTimersByTime(100);
        expect(scrub.isOpen).toBe(false);
    });

    it("a tap elsewhere closes it", () => {
        scrub.tapped(true);
        scrub.tappedElsewhere();
        expect(scrub.isOpen).toBe(false);
        expect(effects).toEqual([open("strip"), close]);
    });

    it("play closes it and plays", () => {
        scrub.tapped(false);
        scrub.playPressed();
        expect(scrub.isOpen).toBe(false);
        expect(effects).toEqual([open("bar"), close, play]);
    });

    it("a new video mid-drag puts it away without playing", () => {
        scrub.dragBegan(true, true);
        scrub.reset();
        vi.advanceTimersByTime(10000);
        expect(effects).toEqual([open("strip"), pause, close]);
    });

    it("a second tap while open does nothing but start the count again", () => {
        scrub.tapped(true);
        vi.advanceTimersByTime(2000);
        scrub.tapped(true);
        vi.advanceTimersByTime(4900);
        expect(scrub.isOpen).toBe(true);
        expect(effects).toEqual([open("strip")]);
    });
});
