import { describe, expect, it } from "vitest";
import {
    SCRUB_SLOP_PX,
    clampPreviewCentre,
    formatClock,
    isOnBar,
    pointerRatio,
    previewTimes,
    rosterStep,
    rosterFineStep,
    rosterTiles,
} from "../ui/scrubPreview";

describe("pointerRatio", () => {
    const bar = { left: 100, width: 400 };

    it("is where the pointer falls along the bar", () => {
        expect(pointerRatio(100, bar)).toBe(0);
        expect(pointerRatio(300, bar)).toBe(0.5);
        expect(pointerRatio(500, bar)).toBe(1);
    });

    it("holds at the ends while a drag runs past them", () => {
        expect(pointerRatio(40, bar)).toBe(0);
        expect(pointerRatio(900, bar)).toBe(1);
    });

    it("is null when the bar has no width to measure, as a hidden one does not", () => {
        expect(pointerRatio(100, { left: 0, width: 0 })).toBeNull();
        expect(pointerRatio(100, { left: 0, width: NaN })).toBeNull();
    });
});

describe("isOnBar", () => {
    const rect = { left: 100, right: 500, top: 400, bottom: 430 };

    it("counts the bar and a margin around it, because a finger is not precise", () => {
        expect(isOnBar(300, 415, rect)).toBe(true);
        expect(isOnBar(300, 400 - SCRUB_SLOP_PX, rect)).toBe(true);
        expect(isOnBar(300, 430 + SCRUB_SLOP_PX, rect)).toBe(true);
        expect(isOnBar(100 - SCRUB_SLOP_PX, 415, rect)).toBe(true);
    });

    it("does not count the picture above it or the buttons below", () => {
        expect(isOnBar(300, 400 - SCRUB_SLOP_PX - 1, rect)).toBe(false);
        expect(isOnBar(300, 430 + SCRUB_SLOP_PX + 1, rect)).toBe(false);
        expect(isOnBar(500 + SCRUB_SLOP_PX + 1, 415, rect)).toBe(false);
    });

    it("is never true for a bar that is not laid out", () => {
        expect(isOnBar(0, 0, { left: 0, right: 0, top: 0, bottom: 0 })).toBe(false);
    });
});

describe("previewTimes", () => {
    it("is the ratio of the duration, for the label", () => {
        expect(previewTimes(0.5, 120).time).toBe(60);
    });

    it("nudges the lookup off the very end, where end-exclusive cue ranges match nothing", () => {
        const { time, lookup } = previewTimes(1, 12);
        expect(time).toBe(12);
        expect(lookup).toBeLessThan(12);
        expect(lookup).toBeGreaterThan(11.99);
    });

    it("leaves a lookup that is already inside the media alone", () => {
        expect(previewTimes(0.25, 100).lookup).toBe(25);
    });

    it("never looks before the start, whatever the duration", () => {
        expect(previewTimes(0, 0.0005).lookup).toBe(0);
    });
});

describe("clampPreviewCentre", () => {
    it("follows the pointer when there is room", () => {
        expect(clampPreviewCentre(300, 100, 8, 592)).toBe(300);
    });

    it("stops the box at the left edge, by its own half width", () => {
        expect(clampPreviewCentre(10, 100, 8, 592)).toBe(58);
    });

    it("stops the box at the right edge", () => {
        expect(clampPreviewCentre(595, 100, 8, 592)).toBe(542);
    });

    it("centres the box when the space is narrower than it is, so it spills evenly", () => {
        expect(clampPreviewCentre(5, 300, 8, 192)).toBe(100);
    });
});

describe("formatClock", () => {
    it.each([
        [0, false, "0:00"],
        [6, false, "0:06"],
        [65, false, "1:05"],
        [599.9, false, "9:59"],
        [3599, false, "59:59"],
        [3600, true, "1:00:00"],
        [3725, true, "1:02:05"],
    ])("%s s (hours: %s) reads %s", (seconds, withHours, text) => {
        expect(formatClock(seconds, withHours)).toBe(text);
    });

    it("does not print a minute count that resets at the hour when hours are off", () => {
        expect(formatClock(3725, false)).toBe("62:05");
    });

    it.each([NaN, -5, Infinity])("reads %s as the start rather than as garbage", (seconds) => {
        expect(formatClock(seconds, false)).toBe("0:00");
    });
});

describe("rosterTiles", () => {
    it("slides the slots past the marker while keeping each one on the same time", () => {
        const a = rosterTiles(100, 200, 800, 100, 10, 1000);
        const b = rosterTiles(105, 200, 800, 100, 10, 1000);
        const slot = (tiles: typeof a, index: number) => tiles.find((t) => t.index === index);
        expect(slot(a, 10)!.time).toBe(slot(b, 10)!.time);
        expect(slot(a, 10)!.left - slot(b, 10)!.left).toBeCloseTo(50);
    });

    it("puts the playhead under the marker", () => {
        const tiles = rosterTiles(100, 200, 800, 100, 10, 1000);
        const under = tiles.find((t) => t.left <= 200 && t.left + 100 > 200)!;
        expect(under.time - 5).toBeLessThanOrEqual(100);
        expect(under.time + 5).toBeGreaterThan(100);
    });

    it("leaves out slots outside the media", () => {
        const tiles = rosterTiles(2, 400, 800, 100, 10, 30);
        expect(tiles.every((t) => t.time >= 0 && t.time < 30)).toBe(true);
        expect(Math.min(...tiles.map((t) => t.index))).toBe(0);
        expect(Math.max(...tiles.map((t) => t.index))).toBe(2);
    });

    it("gives nothing to draw with no width or no media", () => {
        expect(rosterTiles(0, 0, 0, 100, 10, 100)).toEqual([]);
        expect(rosterTiles(0, 0, 800, 100, 10, 0)).toEqual([]);
    });
});

describe("rosterStep", () => {
    it("is clamped between one and fifteen seconds", () => {
        expect(rosterStep(30)).toBe(1);
        expect(rosterStep(1200)).toBe(10);
        expect(rosterStep(100000)).toBe(15);
    });
});

describe("rosterFineStep", () => {
    it("is a quarter of the timeline roster step, so a drag on it is the slow way through", () => {
        expect(rosterFineStep(1200)).toBe(rosterStep(1200) / 4);
    });

    it("never goes finer than the sprite can resolve", () => {
        expect(rosterFineStep(30)).toBe(0.5);
    });
});
