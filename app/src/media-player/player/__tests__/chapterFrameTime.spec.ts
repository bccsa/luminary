import { describe, it, expect } from "vitest";
import { chapterFrameTime } from "../ui/chapterFrameTime";

const chapters = [
    { startTime: 0, endTime: 60, title: "Welcome" },
    { startTime: 60, endTime: 200, title: "The talk" },
    { startTime: 200, endTime: 250, title: "Close" },
];

describe("chapterFrameTime", () => {
    it("is the middle of a chapter, which runs until the next one starts", () => {
        expect(chapterFrameTime(chapters, 0, 300)).toBe(30);
        expect(chapterFrameTime(chapters, 1, 300)).toBe(130);
    });

    it("ends the last chapter at the duration", () => {
        expect(chapterFrameTime(chapters, 2, 300)).toBe(250);
    });

    it("ignores a chapter's own end when the next one starts elsewhere", () => {
        const gapped = [
            { startTime: 0, endTime: 10, title: "A" },
            { startTime: 100, endTime: 200, title: "B" },
        ];
        expect(chapterFrameTime(gapped, 0, 200)).toBe(50);
    });

    it("falls back to the last chapter's own end while the duration is unknown", () => {
        expect(chapterFrameTime(chapters, 2, 0)).toBe(225);
        expect(chapterFrameTime(chapters, 2, NaN)).toBe(225);
        expect(chapterFrameTime(chapters, 2)).toBe(225);
    });

    it("is the start when there is nothing after it to measure to", () => {
        expect(chapterFrameTime([{ startTime: 40, endTime: 40, title: "Empty" }], 0, 0)).toBe(40);
        expect(
            chapterFrameTime([{ startTime: 400, endTime: 0, title: "Past the end" }], 0, 300),
        ).toBe(400);
    });
});
