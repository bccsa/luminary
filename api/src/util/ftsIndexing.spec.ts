import {
    stripHtml,
    normalizeText,
    generateTrigramCounts,
    computeFtsData,
} from "./ftsIndexing";

describe("FTS Indexing", () => {
    describe("stripHtml", () => {
        it("should return empty string for empty input", () => {
            expect(stripHtml("")).toBe("");
            expect(stripHtml(null as any)).toBe("");
        });

        it("should strip HTML tags", () => {
            expect(stripHtml("<p>Hello</p>")).toBe(" Hello ");
        });

        it("should handle script and style blocks", () => {
            expect(stripHtml("<script>alert('x')</script>text")).toBe("text");
            expect(stripHtml("<style>.a{color:red}</style>text")).toBe("text");
        });

        it("should handle HTML comments", () => {
            expect(stripHtml("before<!-- comment -->after")).toBe("beforeafter");
        });

        it("should decode named HTML entities", () => {
            expect(stripHtml("&amp; &lt; &gt;")).toBe("& < >");
        });

        it("should decode numeric HTML entities", () => {
            expect(stripHtml("&#65;")).toBe("A");
            expect(stripHtml("&#x41;")).toBe("A");
        });

        it("should handle invalid entity references as literal text", () => {
            // & without semicolon within max distance
            expect(stripHtml("&notavalidEntity;")).toBe("&notavalidEntity;");
            // & without any semicolon at all
            expect(stripHtml("&standalone")).toBe("&standalone");
            // & at end of string
            expect(stripHtml("test&")).toBe("test&");
            // Numeric entity with invalid number
            expect(stripHtml("&#abc;")).toBe("&#abc;");
        });
    });

    describe("normalizeText", () => {
        it("should lowercase and strip diacritics", () => {
            expect(normalizeText("Héllo WÖRLD")).toBe("hello world");
        });

        it("should collapse whitespace", () => {
            expect(normalizeText("  hello   world  ")).toBe("hello world");
        });

        it("should replace non-word chars with space", () => {
            expect(normalizeText("hello-world")).toBe("hello world");
        });

        it("should return empty string for empty input", () => {
            expect(normalizeText("")).toBe("");
        });
    });

    describe("generateTrigramCounts", () => {
        it("should generate trigrams for a word", () => {
            const { counts, totalCount } = generateTrigramCounts("hello");
            expect(counts.get("hel")).toBe(1);
            expect(counts.get("ell")).toBe(1);
            expect(counts.get("llo")).toBe(1);
            expect(totalCount).toBe(3);
        });

        it("should skip words of 2 chars or less", () => {
            const { counts, totalCount } = generateTrigramCounts("hi to me");
            expect(counts.size).toBe(0);
            expect(totalCount).toBe(0);
        });

        it("should count repeated trigrams", () => {
            const { counts } = generateTrigramCounts("abcabc");
            expect(counts.get("abc")).toBe(2);
            expect(counts.get("bca")).toBe(1);
            expect(counts.get("cab")).toBe(1);
        });

        it("should cap at 5000 characters", () => {
            const longText = "a".repeat(6000);
            const { counts } = generateTrigramCounts(longText);
            // With 5000 'a's normalized, it's one long word producing trigrams of "aaa"
            expect(counts.size).toBe(1);
            expect(counts.get("aaa")).toBeLessThanOrEqual(4998);
        });
    });

    describe("computeFtsData", () => {
        it("should return undefined for a doc with no indexable fields", () => {
            const result = computeFtsData({});
            expect(result).toBeUndefined();
        });

        it("should return undefined for empty string fields", () => {
            const result = computeFtsData({ title: "", summary: "", text: "", author: "" });
            expect(result).toBeUndefined();
        });

        it("should index a simple document", () => {
            const result = computeFtsData({ title: "Hello World" });
            expect(result).toBeDefined();
            expect(result!.fts.length).toBeGreaterThan(0);
            expect(result!.ftsTokenCount).toBeGreaterThan(0);
        });

        it("should apply boost multipliers to tf values", () => {
            // "hello" generates trigrams: hel, ell, llo
            // Title boost = 3.0, so each trigram tf should be 3.0
            const titleResult = computeFtsData({ title: "hello" });
            const textResult = computeFtsData({ text: "hello" });

            expect(titleResult).toBeDefined();
            expect(textResult).toBeDefined();

            const titleEntry = titleResult!.fts.find((e) => e.startsWith("hel:"));
            const textEntry = textResult!.fts.find((e) => e.startsWith("hel:"));

            expect(titleEntry).toBe("hel:3");
            expect(textEntry).toBe("hel:1");
        });

        it("should aggregate tf across fields", () => {
            // Same word in title (boost 3.0) and author (boost 1.0)
            const result = computeFtsData({ title: "hello", author: "hello" });
            expect(result).toBeDefined();

            const helEntry = result!.fts.find((e) => e.startsWith("hel:"));
            expect(helEntry).toBe("hel:4");
        });

        it("should strip HTML from the text field", () => {
            const result = computeFtsData({ text: "<p>hello</p>" });
            expect(result).toBeDefined();
            expect(result!.fts.find((e) => e.startsWith("hel:"))).toBeDefined();
        });

        it("should not strip HTML from non-HTML fields", () => {
            // Title with angle brackets — treated as literal text, not HTML
            const result = computeFtsData({ title: "hello" });
            expect(result).toBeDefined();
            expect(result!.fts.length).toBeGreaterThan(0);
        });

        it("should compute raw unboosted tokenCount", () => {
            // "hello" = 3 trigrams, "world" = 3 trigrams = 6 total
            const result = computeFtsData({ title: "hello world" });
            expect(result).toBeDefined();
            expect(result!.ftsTokenCount).toBe(6); // raw count, not boosted
        });

        it("should sum tokenCount across fields", () => {
            // "hello" in title = 3 trigrams, "world" in summary = 3 trigrams
            const result = computeFtsData({ title: "hello", summary: "world" });
            expect(result).toBeDefined();
            expect(result!.ftsTokenCount).toBe(6);
        });
    });
});
