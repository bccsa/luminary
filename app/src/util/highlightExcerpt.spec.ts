import { describe, it, expect } from "vitest";
import type { HighlightRange } from "luminary-shared";
import { highlightExcerpts, joinLines } from "./highlightExcerpt";

const rangeOf = (text: string, quote: string): HighlightRange => {
    const start = text.indexOf(quote);
    return { start, end: start + quote.length, color: "yellow", text: quote };
};

describe("joinLines", () => {
    it("joins lines with one space, adding a full stop where a line has no closing punctuation", () => {
        expect(joinLines(["keep my commandments", "If you love me"])).toBe(
            "keep my commandments. If you love me",
        );
        expect(joinLines(["He asked: “Why?”", "", "  ", "Then he left"])).toBe(
            "He asked: “Why?” Then he left",
        );
        expect(joinLines(["one,", "two;", "three."])).toBe("one, two; three.");
    });
});

describe("highlightExcerpts", () => {
    it("separates paragraphs and <br> lines that the saved text runs together", () => {
        const html = "<h2>Title</h2><p>Keep my commandments</p><p>If you<br>love me.</p>";
        const text = "TitleKeep my commandmentsIf youlove me.";
        const ranges = [rangeOf(text, "commandmentsIf youlove"), rangeOf(text, "TitleKeep")];

        expect(highlightExcerpts(html, ranges)).toEqual([
            "commandments. If you. love",
            "Title. Keep",
        ]);
    });

    it("finds a passage that moved after an edit, and falls back to the saved text when it's gone", () => {
        const html = "<p>New intro.</p><p>Keep my commandments</p><p>If you love me</p>";
        const moved = {
            start: 0,
            end: 14,
            color: "blue",
            text: "commandmentsIf",
        } as HighlightRange;
        const gone = { start: 0, end: 4, color: "blue", text: "Gone\n\ntext" } as HighlightRange;

        expect(highlightExcerpts(html, [moved, gone])).toEqual(["commandments. If", "Gone text"]);
        expect(highlightExcerpts(undefined, [gone])).toEqual(["Gone text"]);
    });
});
