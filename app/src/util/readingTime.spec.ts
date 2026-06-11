import { describe, expect, it } from "vitest";
import {
    DEFAULT_READING_SPEED_WPM,
    READING_MAX_DWELL_MS,
    READING_MIN_DWELL_MS,
    READING_SKIM_WPM_MULTIPLIER,
    computeBlockDwellMs,
    computeEstimatedReadingMinutes,
    computeMaxScrollWordsPerSec,
    computeScrollVelocityWordsPerSec,
    countWords,
    estimateWordsPerPixel,
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

describe("estimateWordsPerPixel", () => {
    it("returns word density from count and rendered height", () => {
        expect(estimateWordsPerPixel(100, 500)).toBe(0.2);
        expect(estimateWordsPerPixel(50, 250)).toBe(0.2);
    });

    it("returns 0 for invalid inputs", () => {
        expect(estimateWordsPerPixel(0, 100)).toBe(0);
        expect(estimateWordsPerPixel(10, 0)).toBe(0);
    });
});

describe("computeMaxScrollWordsPerSec", () => {
    it("returns WPM/60 × skim multiplier at default WPM", () => {
        expect(computeMaxScrollWordsPerSec(200)).toBeCloseTo((200 / 60) * READING_SKIM_WPM_MULTIPLIER);
        expect(computeMaxScrollWordsPerSec()).toBeCloseTo((200 / 60) * READING_SKIM_WPM_MULTIPLIER);
    });

    it("scales the skim cap with language reading speed", () => {
        expect(computeMaxScrollWordsPerSec(300)).toBeCloseTo((300 / 60) * READING_SKIM_WPM_MULTIPLIER);
        expect(computeMaxScrollWordsPerSec(100)).toBeCloseTo((100 / 60) * READING_SKIM_WPM_MULTIPLIER);
    });
});

describe("computeScrollVelocityWordsPerSec", () => {
    it("converts scroll delta to words per second", () => {
        // 100 px in 100 ms at 0.2 words/px → 20 words in 0.1 s → 200 w/s
        expect(computeScrollVelocityWordsPerSec(100, 100, 0.2)).toBe(200);
        expect(computeScrollVelocityWordsPerSec(-100, 100, 0.2)).toBe(200);
    });

    it("returns 0 when sample window is too short or density is zero", () => {
        expect(computeScrollVelocityWordsPerSec(100, 49, 0.2)).toBe(0);
        expect(computeScrollVelocityWordsPerSec(100, 100, 0)).toBe(0);
    });

    it("treats the same px/s differently by block density", () => {
        const tallBlockDensity = 100 / 800; // phone-like tall block
        const shortBlockDensity = 100 / 300; // desktop-like short block
        const deltaY = 500;
        const deltaMs = 500;

        const tallVelocity = computeScrollVelocityWordsPerSec(deltaY, deltaMs, tallBlockDensity);
        const shortVelocity = computeScrollVelocityWordsPerSec(deltaY, deltaMs, shortBlockDensity);

        expect(shortVelocity).toBeGreaterThan(tallVelocity);
        expect(tallVelocity).toBeCloseTo(125);
        expect(shortVelocity).toBeCloseTo((deltaY * shortBlockDensity) / (deltaMs / 1000));
    });
});
