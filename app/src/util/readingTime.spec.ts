import { describe, expect, it } from "vitest";
import {
    DEFAULT_READING_SPEED_WPM,
    READING_MAX_DWELL_MS,
    READING_MIN_DWELL_MS,
    computeBlockDwellMs,
    computeEstimatedReadingMinutes,
    countWords,
    resolveReadingSpeedWpm,
} from "./readingTime";

describe("resolveReadingSpeedWpm", () => {
    it("returns the language value when valid", () => {
        expect(resolveReadingSpeedWpm(250)).toBe(250);
    });

    it("falls back for missing or invalid values", () => {
        expect(resolveReadingSpeedWpm()).toBe(DEFAULT_READING_SPEED_WPM);
        expect(resolveReadingSpeedWpm(0)).toBe(DEFAULT_READING_SPEED_WPM);
        expect(resolveReadingSpeedWpm(-1)).toBe(DEFAULT_READING_SPEED_WPM);
        expect(resolveReadingSpeedWpm(Number.NaN)).toBe(DEFAULT_READING_SPEED_WPM);
    });
});

describe("countWords", () => {
    it("counts whitespace-separated tokens", () => {
        expect(countWords("Block 1")).toBe(2);
        expect(countWords("  one   two three  ")).toBe(3);
        expect(countWords("")).toBe(0);
    });
});

describe("computeEstimatedReadingMinutes", () => {
    it("rounds up article reading time from word count and WPM", () => {
        expect(computeEstimatedReadingMinutes(400, 200)).toBe(2);
        expect(computeEstimatedReadingMinutes(401, 200)).toBe(3);
        expect(computeEstimatedReadingMinutes(0, 200)).toBe(0);
    });
});

describe("computeBlockDwellMs", () => {
    it("scales dwell from word count and language WPM", () => {
        expect(computeBlockDwellMs(2, 200)).toBe(600);
        expect(computeBlockDwellMs(10, 200)).toBe(3000);
    });

    it("clamps to min and max dwell bounds", () => {
        expect(computeBlockDwellMs(1, 200)).toBe(READING_MIN_DWELL_MS);
        expect(computeBlockDwellMs(40, 200)).toBe(READING_MAX_DWELL_MS);
    });

    it("falls back when WPM is missing or invalid", () => {
        expect(computeBlockDwellMs(2, 0)).toBe(600);
        expect(computeBlockDwellMs(2)).toBe(600);
    });
});
