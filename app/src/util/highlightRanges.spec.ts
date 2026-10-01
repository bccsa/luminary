import { describe, it, expect } from "vitest";
import {
    addHighlight,
    anchorHighlights,
    extendToPunctuation,
    paintHighlights,
    parseSavedRanges,
    rangesFromLegacyHtml,
    removeHighlights,
    snapToWords,
    textOffset,
    type HighlightRange,
} from "./highlightRanges";

const TEXT = "The quick brown fox jumps over the lazy dog.";
const at = (word: string) => ({ start: TEXT.indexOf(word), end: TEXT.indexOf(word) + word.length });
const range = (word: string, color: HighlightRange["color"] = "yellow"): HighlightRange => ({
    ...at(word),
    color,
    text: word,
});

describe("snapToWords", () => {
    it("widens a selection that starts or ends mid-word to the whole words", () => {
        // "ick bro" — a finger that landed inside "quick" and slipped short of "brown"'s end
        const snapped = snapToWords(TEXT, TEXT.indexOf("ick"), TEXT.indexOf("own"));
        expect(TEXT.slice(snapped!.start, snapped!.end)).toBe("quick brown");
    });

    it("trims whitespace around the selection and ignores whitespace-only selections", () => {
        const { start, end } = at(" fox ");
        expect(TEXT.slice(...Object.values(snapToWords(TEXT, start, end)!))).toBe("fox");
        expect(snapToWords("a   b", 1, 4)).toBeUndefined();
    });

    it("refuses a selection with no word in it, such as a lone full stop", () => {
        expect(snapToWords(TEXT, TEXT.length - 1, TEXT.length)).toBeUndefined();
        expect(snapToWords("“— …”", 0, 5)).toBeUndefined();
    });

    it("keeps punctuation next to a word out unless it was selected", () => {
        const snapped = snapToWords(TEXT, TEXT.indexOf("do"), TEXT.indexOf("do") + 2);
        expect(TEXT.slice(snapped!.start, snapped!.end)).toBe("dog");
    });

    it("treats apostrophes, hyphens and accented letters as part of a word", () => {
        const text = "it’s a well-known café";
        const snapped = snapToWords(text, 1, text.indexOf("kn") + 1);
        expect(text.slice(snapped!.start, snapped!.end)).toBe("it’s a well-known");
        const cafe = snapToWords(text, text.length - 2, text.length - 1);
        expect(text.slice(cafe!.start, cafe!.end)).toBe("café");
    });
});

describe("extendToPunctuation", () => {
    const extend = (text: string, selected: string, limit?: number) =>
        text.slice(
            text.indexOf(selected),
            extendToPunctuation(text, text.indexOf(selected) + selected.length, limit),
        );

    it("runs on to the next punctuation mark and a closing quote after it", () => {
        const text = "You don’t want to face the day. You ask yourself: “Why do I?” Then";
        expect(extend(text, "want to face the")).toBe("want to face the day.");
        expect(extend(text, "You ask")).toBe("You ask yourself:");
        expect(extend(text, "Why do")).toBe("Why do I?”");
    });

    it("leaves a selection that already ends on punctuation alone", () => {
        expect(extend("It rained. Then it stopped.", "It rained.")).toBe("It rained.");
        expect(extend("She said “stop.” Then", "She said “stop.”")).toBe("She said “stop.”");
    });

    it("stops before a dash, and at the end of the paragraph when there is no punctuation", () => {
        expect(extend("to test you – so that you", "to test")).toBe("to test you");
        const heading = "An active ongoing work  ";
        expect(extend(heading, "An active ongoing", heading.length)).toBe("An active ongoing work");
        expect(extend("first line\nsecond line.", "first")).toBe("first line");
    });

    it("never runs past the limit, and ignores a full stop inside a number", () => {
        const text = "Version 3.5 is out. Next paragraph.";
        expect(extend(text, "Version", text.indexOf(" is") + 3)).toBe("Version 3.5 is");
        expect(extend(text, "Version")).toBe("Version 3.5 is out.");
    });
});

describe("addHighlight / removeHighlights", () => {
    it("merges a same-colour highlight it overlaps or touches, so it can be extended", () => {
        let ranges = addHighlight([], TEXT, at("quick").start, at("quick").end, "yellow");
        ranges = addHighlight(ranges, TEXT, at("quick").end, at("brown").end, "yellow");

        expect(ranges).toEqual([range("quick brown")]);
    });

    it("paints a different colour over only the selected part of an old highlight", () => {
        const ranges = addHighlight(
            [range("quick brown fox jumps", "green")],
            TEXT,
            at("fox").start,
            at("fox").end,
            "yellow",
        );

        expect(ranges).toEqual([
            range("quick brown", "green"),
            range("fox", "yellow"),
            range("jumps", "green"),
        ]);
    });

    it("drops a leftover piece of an old highlight that holds no word", () => {
        const text = "Stop. Go";
        const ranges = addHighlight(
            [{ start: 0, end: 6, color: "green", text: "Stop. " }],
            text,
            0,
            4,
            "blue",
        );
        expect(ranges).toEqual([{ start: 0, end: 4, color: "blue", text: "Stop" }]);
    });

    it("removes each highlight the selection touches in full", () => {
        const ranges = [range("quick brown"), range("lazy")];
        expect(removeHighlights(ranges, at("brown").start, at("brown").start + 2)).toEqual([
            range("lazy"),
        ]);
    });
});

describe("anchorHighlights", () => {
    it("keeps, moves or drops saved highlights to match the edited text", () => {
        const edited = "A quick brown fox. It jumps over a sleepy dog.";
        const anchored = anchorHighlights([range("quick"), range("jumps"), range("lazy")], edited);
        expect(anchored.map((r) => edited.slice(r.start, r.end))).toEqual(["quick", "jumps"]);
    });

    it("prefers the occurrence nearest to where the highlight used to be", () => {
        const text = "the end. the end.";
        const [anchored] = anchorHighlights(
            [{ start: 11, end: 18, color: "yellow", text: "the end" }],
            text,
        );
        expect(anchored.start).toBe(9);
    });
});

describe("parseSavedRanges", () => {
    it("drops malformed entries", () => {
        expect(
            parseSavedRanges([
                range("fox"),
                { start: 5, end: 2, color: "yellow", text: "x" },
                { start: 0, end: 3, color: "orange", text: "The" },
                null,
            ]),
        ).toEqual([range("fox")]);
        expect(parseSavedRanges("nope")).toBeUndefined();
    });
});

describe("rangesFromLegacyHtml", () => {
    it("converts marks in an old article snapshot into ranges over its text", () => {
        const html =
            '<p>The <mark style="background-color: rgba(74, 222, 128, 0.5)">quick <b>brown</b></mark> fox</p>';
        expect(rangesFromLegacyHtml(html)).toEqual([
            { start: 4, end: 15, color: "green", text: "quick brown" },
        ]);
    });
});

describe("paintHighlights", () => {
    const article = () => {
        const root = document.createElement("div");
        root.innerHTML = "<p>The quick <em>brown</em> fox</p>\n<p>jumps <mark>over</mark></p>";
        return root;
    };

    it("wraps each range across inline elements without changing the text", () => {
        const root = article();
        const text = root.textContent!;
        const start = text.indexOf("quick");
        paintHighlights(root, [{ start, end: start + 11, color: "yellow", text: "quick brown" }]);

        const marks = root.querySelectorAll("mark[data-highlight]");
        expect([...marks].map((m) => m.textContent)).toEqual(["quick ", "brown"]);
        expect(root.textContent).toBe(text);
    });

    it("repaints from scratch and leaves the article's own marks alone", () => {
        const root = article();
        const start = root.textContent!.indexOf("fox");
        paintHighlights(root, [{ start, end: start + 3, color: "pink", text: "fox" }]);
        paintHighlights(root, []);

        expect(root.querySelectorAll("mark[data-highlight]")).toHaveLength(0);
        expect(root.querySelectorAll("mark")).toHaveLength(1);
        expect(root.innerHTML).toBe(article().innerHTML);
    });

    it("maps DOM boundary points to the same offsets it paints", () => {
        const root = article();
        const em = root.querySelector("em")!.firstChild!;
        expect(textOffset(root, em, 0)).toBe(root.textContent!.indexOf("brown"));
    });
});
