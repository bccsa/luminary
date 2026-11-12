import { describe, expect, it } from "vitest";
import { chapterSegments, type Chapter } from "@luminary-media-converter/player-web";
import { DENSE_CHAPTERS, MAX_CUT_CHAPTERS, chapterMask, formatChapterOf } from "../ui/chapterBar";

const chapter = (startTime: number, title = ""): Chapter => ({
    startTime,
    endTime: startTime + 1,
    title,
});
const bands = (mask: string) => (mask.match(/transparent calc/g) ?? []).length / 2;

describe("chapterMask", () => {
    it("is empty when there is nothing to cut", () => {
        expect(chapterMask([])).toBe("");
        expect(chapterMask(chapterSegments([chapter(0)], 100))).toBe("");
    });

    it("opens one gap at each chapter start after the first", () => {
        const segments = chapterSegments([chapter(0), chapter(25), chapter(50), chapter(75)], 100);
        const mask = chapterMask(segments);
        expect(bands(mask)).toBe(3);
        expect(mask).toContain("25.000%");
        expect(mask).toContain("50.000%");
        expect(mask).toContain("75.000%");
        expect(mask.startsWith("linear-gradient(to right, #000 0")).toBe(true);
        expect(mask.endsWith("#000 100%)")).toBe(true);
    });

    it("leaves the whole bar opaque outside the gaps, and follows the player scale", () => {
        const mask = chapterMask(chapterSegments([chapter(0), chapter(50)], 100));
        expect(mask).toContain("calc(50.000% - (var(--lmpl-s, 1) * 1.5px))");
        expect(mask).toContain("calc(50.000% + (var(--lmpl-s, 1) * 1.5px))");
    });

    it("cuts a leading stretch before a late first chapter", () => {
        expect(bands(chapterMask(chapterSegments([chapter(10), chapter(60)], 100)))).toBe(2);
    });
});

describe("chapterMask with many chapters", () => {
    const many = (count: number) =>
        chapterSegments(
            Array.from({ length: count }, (_, i) => chapter(i * 10)),
            count * 10,
        );

    it("keeps the full gap up to the dense limit", () => {
        expect(chapterMask(many(DENSE_CHAPTERS))).toContain("* 1.5px");
    });

    it("thins the gap to a hairline past it", () => {
        const mask = chapterMask(many(DENSE_CHAPTERS + 1));
        expect(mask).toContain("* 0.5px");
        expect(mask).not.toContain("* 1.5px");
        expect(bands(mask)).toBe(DENSE_CHAPTERS);
    });

    it("leaves the bar whole past the cut limit", () => {
        expect(chapterMask(many(MAX_CUT_CHAPTERS))).not.toBe("");
        expect(chapterMask(many(MAX_CUT_CHAPTERS + 1))).toBe("");
    });
});

describe("formatChapterOf", () => {
    it("fills both numbers, wherever the translation puts them", () => {
        expect(formatChapterOf("Chapter {index} of {count}", 4, 7)).toBe("Chapter 4 of 7");
        expect(formatChapterOf("{count} chapters, now {index}", 4, 7)).toBe("7 chapters, now 4");
    });
});
