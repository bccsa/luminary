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

    it("a tap opens the strip and holds the video, without moving it", () => {
        scrub.tapped(true, true);
        expect(scrub.mode).toBe("strip");
        expect(effects).toEqual([open("strip"), pause]);
    });

    it("without frames a tap opens the thick bar instead", () => {
        scrub.tapped(false, true);
        expect(scrub.mode).toBe("bar");
        expect(effects).toEqual([open("bar"), pause]);
    });

    it("only a drag moves the video, and it stays held after", () => {
        scrub.tapped(true, true);
        scrub.dragBegan(true, false);
        scrub.dragEnded(42);
        expect(effects).toEqual([open("strip"), pause, { kind: "seek", time: 42 }]);
        expect(scrub.isOpen).toBe(true);
    });

    it("a drag from closed opens it on the way", () => {
        scrub.dragBegan(true, true);
        scrub.dragEnded(10);
        expect(effects).toEqual([open("strip"), pause, { kind: "seek", time: 10 }]);
    });

    it("closes five seconds after the last touch, and the video plays on", () => {
        scrub.tapped(true, true);
        vi.advanceTimersByTime(4900);
        expect(scrub.isOpen).toBe(true);
        vi.advanceTimersByTime(100);
        expect(scrub.isOpen).toBe(false);
        expect(effects.slice(-2)).toEqual([close, play]);
    });

    it("a finger on it keeps it open, and the count starts again when it lifts", () => {
        scrub.tapped(true, true);
        vi.advanceTimersByTime(2000);
        scrub.dragBegan(true, false);
        vi.advanceTimersByTime(10000);
        expect(scrub.isOpen).toBe(true);
        scrub.dragEnded(5);
        vi.advanceTimersByTime(4900);
        expect(scrub.isOpen).toBe(true);
        vi.advanceTimersByTime(100);
        expect(scrub.isOpen).toBe(false);
    });

    it("a tap elsewhere closes it and the video plays on", () => {
        scrub.tapped(true, true);
        scrub.tappedElsewhere();
        expect(scrub.isOpen).toBe(false);
        expect(effects).toEqual([open("strip"), pause, close, play]);
    });

    it("a video that was paused stays paused when it closes", () => {
        scrub.tapped(true, false);
        vi.advanceTimersByTime(5000);
        expect(effects).toEqual([open("strip"), close]);
    });

    it("play closes it and plays, even if the video was paused", () => {
        scrub.tapped(false, false);
        scrub.playPressed();
        expect(scrub.isOpen).toBe(false);
        expect(effects).toEqual([open("bar"), close, play]);
    });

    it("a new video puts it away without playing", () => {
        scrub.tapped(true, true);
        scrub.reset();
        vi.advanceTimersByTime(10000);
        expect(effects).toEqual([open("strip"), pause, close]);
    });

    it("a second tap while open does nothing but start the count again", () => {
        scrub.tapped(true, true);
        vi.advanceTimersByTime(2000);
        scrub.tapped(true, false);
        vi.advanceTimersByTime(4900);
        expect(scrub.isOpen).toBe(true);
        expect(effects).toEqual([open("strip"), pause]);
    });
});
