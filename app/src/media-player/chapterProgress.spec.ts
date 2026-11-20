import { describe, it, expect } from "vitest";
import { chapterProgress } from "./chapterProgress";

const chapter = { startTime: 60, endTime: 160, title: "The talk" };

describe("chapterProgress", () => {
    it("is nothing before the chapter and all of it after", () => {
        expect(chapterProgress(chapter, 0)).toBe(0);
        expect(chapterProgress(chapter, 60)).toBe(0);
        expect(chapterProgress(chapter, 160)).toBe(1);
        expect(chapterProgress(chapter, 900)).toBe(1);
    });

    it("is the share played in between", () => {
        expect(chapterProgress(chapter, 110)).toBe(0.5);
    });

    it("treats a chapter with no length as played once it has started", () => {
        const empty = { startTime: 60, endTime: 60, title: "Empty" };
        expect(chapterProgress(empty, 59)).toBe(0);
        expect(chapterProgress(empty, 60)).toBe(1);
    });
});
