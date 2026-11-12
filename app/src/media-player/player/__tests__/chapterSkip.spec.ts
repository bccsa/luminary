import { describe, expect, it } from "vitest";
import {
    CHAPTER_GLYPHS,
    chapterIcon,
    hasChapterSkip,
    nextChapterTime,
    previousChapterTime,
} from "../ui/chapterSkip";

const chapter = (startTime: number, endTime: number, title = "") => ({ startTime, endTime, title });
const chapters = [chapter(0, 60), chapter(60, 120), chapter(120, 300)];

describe("hasChapterSkip", () => {
    it("needs at least two chapters", () => {
        expect(hasChapterSkip([])).toBe(false);
        expect(hasChapterSkip([chapter(0, 300)])).toBe(false);
        expect(hasChapterSkip(chapters)).toBe(true);
    });
});

describe("nextChapterTime", () => {
    it("goes to the start of the chapter after the one playing", () => {
        expect(nextChapterTime(chapters, 10)).toBe(60);
        expect(nextChapterTime(chapters, 60)).toBe(120);
    });

    it("has nowhere to go in the last chapter", () => {
        expect(nextChapterTime(chapters, 150)).toBeNull();
    });

    it("goes to the first chapter from before it", () => {
        expect(nextChapterTime([chapter(30, 60), chapter(60, 90)], 5)).toBe(30);
    });

    it("counts a playhead just short of a start as at it, so a seek landing early does not repeat", () => {
        expect(nextChapterTime(chapters, 59.7)).toBe(120);
    });

    it("reads chapters in time order whatever the list's order", () => {
        expect(nextChapterTime([chapter(120, 300), chapter(0, 60), chapter(60, 120)], 10)).toBe(60);
    });

    it("has nowhere to go without chapters", () => {
        expect(nextChapterTime([], 10)).toBeNull();
    });
});

describe("previousChapterTime", () => {
    it("goes back to the start of the chapter playing when more than 3 s into it", () => {
        expect(previousChapterTime(chapters, 75)).toBe(60);
        expect(previousChapterTime(chapters, 63.5)).toBe(60);
    });

    it("goes to the chapter before when within 3 s of the start", () => {
        expect(previousChapterTime(chapters, 62)).toBe(0);
        expect(previousChapterTime(chapters, 120)).toBe(60);
    });

    it("goes to the start of the video from the first chapter's opening seconds", () => {
        expect(previousChapterTime(chapters, 1)).toBe(0);
        expect(previousChapterTime(chapters, 0)).toBe(0);
    });

    it("goes to the first chapter's start when well into it", () => {
        expect(previousChapterTime(chapters, 20)).toBe(0);
        expect(previousChapterTime([chapter(30, 60), chapter(60, 90)], 45)).toBe(30);
    });

    it("goes to the start of the video from before the first chapter, or its opening seconds", () => {
        expect(previousChapterTime([chapter(30, 60), chapter(60, 90)], 20)).toBe(0);
        expect(previousChapterTime([chapter(30, 60), chapter(60, 90)], 31)).toBe(0);
    });

    it("counts a playhead just short of a start as at it", () => {
        expect(previousChapterTime(chapters, 119.8)).toBe(60);
    });

    it("goes to the start of the video without chapters", () => {
        expect(previousChapterTime([], 42)).toBe(0);
    });
});

describe("chapterIcon", () => {
    it("draws the glyph's layers on the 18-unit grid", () => {
        const svg = chapterIcon(true);
        expect(svg).toContain('viewBox="0 0 18 18"');
        for (const layer of CHAPTER_GLYPHS.next) expect(svg).toContain(layer.path);
        expect(chapterIcon(false)).toContain(CHAPTER_GLYPHS.previous[0]!.path);
    });
});
