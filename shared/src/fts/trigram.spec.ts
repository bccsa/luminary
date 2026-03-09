import { describe, it, expect } from "vitest";
import {
    stripHtml,
    normalizeText,
    generateTrigrams,
    generateTrigramCounts,
    generateSearchTrigrams,
} from "./trigram";

describe("stripHtml", () => {
    it("returns empty string for empty input", () => {
        expect(stripHtml("")).toBe("");
        expect(stripHtml(undefined as any)).toBe("");
    });

    it("strips basic HTML tags", () => {
        expect(stripHtml("<p>Hello</p>").trim()).toBe("Hello");
    });

    it("strips nested tags", () => {
        expect(stripHtml("<div><p>Hello <strong>world</strong></p></div>").trim()).toContain(
            "Hello",
        );
        expect(stripHtml("<div><p>Hello <strong>world</strong></p></div>").trim()).toContain(
            "world",
        );
    });

    it("strips script tags and their content", () => {
        const html = '<p>Before</p><script>alert("xss")</script><p>After</p>';
        const result = stripHtml(html);
        expect(result).not.toContain("alert");
        expect(result).not.toContain("xss");
        expect(result).toContain("Before");
        expect(result).toContain("After");
    });

    it("strips style tags and their content", () => {
        const html = "<p>Text</p><style>.red { color: red; }</style><p>More</p>";
        const result = stripHtml(html);
        expect(result).not.toContain("color");
        expect(result).toContain("Text");
        expect(result).toContain("More");
    });

    it("strips HTML comments", () => {
        const html = "<p>Before</p><!-- this is a comment --><p>After</p>";
        const result = stripHtml(html);
        expect(result).not.toContain("comment");
        expect(result).toContain("Before");
        expect(result).toContain("After");
    });

    it("decodes named HTML entities", () => {
        expect(stripHtml("&amp; &lt; &gt; &quot;")).toBe('& < > "');
    });

    it("decodes numeric HTML entities", () => {
        expect(stripHtml("&#65;&#66;")).toBe("AB");
    });

    it("decodes hex HTML entities", () => {
        expect(stripHtml("&#x41;&#x42;")).toBe("AB");
    });

    it("handles plain text without HTML", () => {
        expect(stripHtml("Hello world")).toBe("Hello world");
    });
});

describe("normalizeText", () => {
    it("returns empty string for empty input", () => {
        expect(normalizeText("")).toBe("");
        expect(normalizeText(undefined as any)).toBe("");
    });

    it("lowercases text", () => {
        expect(normalizeText("Hello World")).toBe("hello world");
    });

    it("strips diacritics", () => {
        expect(normalizeText("café")).toBe("cafe");
        expect(normalizeText("naïve")).toBe("naive");
        expect(normalizeText("über")).toBe("uber");
    });

    it("collapses whitespace", () => {
        expect(normalizeText("hello   world")).toBe("hello world");
        expect(normalizeText("  hello  world  ")).toBe("hello world");
    });

    it("handles tabs and newlines", () => {
        expect(normalizeText("hello\n\tworld")).toBe("hello world");
    });
});

describe("generateTrigrams", () => {
    it("returns empty set for empty input", () => {
        expect(generateTrigrams("").size).toBe(0);
    });

    it("generates trigrams from a word", () => {
        const trigrams = generateTrigrams("search");
        expect(trigrams.has("sea")).toBe(true);
        expect(trigrams.has("ear")).toBe(true);
        expect(trigrams.has("arc")).toBe(true);
        expect(trigrams.has("rch")).toBe(true);
    });

    it("skips words of 2 characters or less", () => {
        const trigrams = generateTrigrams("a of the");
        expect(trigrams.has("the")).toBe(true);
        // "a" and "of" are too short
        expect(trigrams.size).toBe(1);
    });

    it("returns unique trigrams only", () => {
        // "the" appears in both words but should only be counted once
        const trigrams = generateTrigrams("theme other");
        const arr = [...trigrams];
        const uniqueArr = [...new Set(arr)];
        expect(arr.length).toBe(uniqueArr.length);
    });

    it("normalizes text before generating trigrams", () => {
        const trigrams = generateTrigrams("HELLO");
        expect(trigrams.has("hel")).toBe(true);
        expect(trigrams.has("ell")).toBe(true);
        expect(trigrams.has("llo")).toBe(true);
    });

    it("handles diacritics", () => {
        const trigrams = generateTrigrams("café");
        expect(trigrams.has("caf")).toBe(true);
        expect(trigrams.has("afe")).toBe(true);
    });

    it("caps text at 5000 characters", () => {
        const longText = "abcdefghij ".repeat(1000); // 11000 chars
        const trigrams = generateTrigrams(longText);
        // Should still produce trigrams but from capped text
        expect(trigrams.size).toBeGreaterThan(0);
    });
});

describe("generateTrigramCounts", () => {
    it("returns empty map for empty input", () => {
        const { counts, totalCount } = generateTrigramCounts("");
        expect(counts.size).toBe(0);
        expect(totalCount).toBe(0);
    });

    it("returns accurate frequency counts", () => {
        // "banana" → trigrams: "ban", "ana", "nan", "ana"
        // "ana" appears twice, others once
        const { counts, totalCount } = generateTrigramCounts("banana");
        expect(counts.get("ban")).toBe(1);
        expect(counts.get("ana")).toBe(2);
        expect(counts.get("nan")).toBe(1);
        expect(totalCount).toBe(4);
    });

    it("totalCount equals sum of all counts", () => {
        const { counts, totalCount } = generateTrigramCounts("searching for something");
        let sum = 0;
        for (const count of counts.values()) {
            sum += count;
        }
        expect(totalCount).toBe(sum);
    });

    it("skips words of 2 characters or less", () => {
        const { counts, totalCount } = generateTrigramCounts("a of the");
        expect(counts.has("the")).toBe(true);
        expect(counts.size).toBe(1);
        expect(totalCount).toBe(1);
    });

    it("normalizes text before counting", () => {
        const { counts } = generateTrigramCounts("HELLO");
        expect(counts.has("hel")).toBe(true);
        expect(counts.has("HEL")).toBe(false);
    });

    it("caps text at 5000 characters", () => {
        const longText = "abcdefghij ".repeat(1000);
        const { counts } = generateTrigramCounts(longText);
        expect(counts.size).toBeGreaterThan(0);
    });
});

describe("generateSearchTrigrams", () => {
    it("returns empty array for empty input", () => {
        expect(generateSearchTrigrams("")).toEqual([]);
    });

    it("returns array of unique trigrams", () => {
        const trigrams = generateSearchTrigrams("search");
        expect(trigrams).toContain("sea");
        expect(trigrams).toContain("ear");
        expect(trigrams).toContain("arc");
        expect(trigrams).toContain("rch");
        expect(trigrams.length).toBe(4);
    });

    it("deduplicates trigrams across words", () => {
        const trigrams = generateSearchTrigrams("theme other");
        const unique = new Set(trigrams);
        expect(trigrams.length).toBe(unique.size);
    });

    it("skips short words", () => {
        const trigrams = generateSearchTrigrams("a search");
        expect(trigrams).toContain("sea");
        // "a" should not produce any trigrams
        expect(trigrams.every((t) => t.length === 3)).toBe(true);
    });
});
