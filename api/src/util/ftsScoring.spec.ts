import {
    FTS_BM25_B,
    FTS_BM25_K1,
    bm25Score,
    generateSearchTrigrams,
    idf,
    queryWords,
    wordMatchScore,
} from "./ftsScoring";

describe("ftsScoring", () => {
    describe("generateSearchTrigrams", () => {
        it("generates de-duplicated trigrams and skips words of 2 chars or less", () => {
            expect(generateSearchTrigrams("hello")).toEqual(["hel", "ell", "llo"]);
            // "hi" is skipped (<= 2 chars); duplicates across repeated words are removed
            expect(generateSearchTrigrams("hi hello hello")).toEqual(["hel", "ell", "llo"]);
        });

        it("normalizes case and diacritics", () => {
            expect(generateSearchTrigrams("HÉLLO")).toEqual(generateSearchTrigrams("hello"));
        });

        it("returns empty for blank input", () => {
            expect(generateSearchTrigrams("   ")).toEqual([]);
        });
    });

    describe("queryWords", () => {
        it("returns normalized words longer than 2 chars", () => {
            expect(queryWords("The cat sat on a mat")).toEqual(["the", "cat", "sat", "mat"]);
        });
    });

    describe("idf", () => {
        it("matches the BM25 idf formula", () => {
            // log((N - df + 0.5) / (df + 0.5) + 1)
            expect(idf(100, 10)).toBeCloseTo(Math.log((100 - 10 + 0.5) / (10 + 0.5) + 1), 6);
        });

        it("decreases as document frequency rises", () => {
            expect(idf(100, 1)).toBeGreaterThan(idf(100, 50));
        });
    });

    describe("bm25Score", () => {
        it("computes the BM25 sum over the idf map", () => {
            const tfMap = new Map([["abc", 2]]);
            const idfMap = new Map([["abc", 1.5]]);
            const dl = 10;
            const avgdl = 10;
            // 1.5 * (2 * (k1+1)) / (2 + k1 * (1 - b + b * dl/avgdl))
            const expected =
                1.5 *
                ((2 * (FTS_BM25_K1 + 1)) /
                    (2 + FTS_BM25_K1 * (1 - FTS_BM25_B + FTS_BM25_B * (dl / avgdl))));
            expect(bm25Score(tfMap, dl, idfMap, avgdl)).toBeCloseTo(expected, 6);
        });

        it("ignores trigrams the document does not contain", () => {
            const idfMap = new Map([
                ["abc", 1.5],
                ["xyz", 2.0],
            ]);
            const withMissing = bm25Score(new Map([["abc", 2]]), 10, idfMap, 10);
            const onlyPresent = bm25Score(
                new Map([["abc", 2]]),
                10,
                new Map([["abc", 1.5]]),
                10,
            );
            expect(withMissing).toBeCloseTo(onlyPresent, 6);
        });

        it("guards against zero document length", () => {
            expect(() => bm25Score(new Map([["abc", 1]]), 0, new Map([["abc", 1]]), 10)).not.toThrow();
        });
    });

    describe("wordMatchScore", () => {
        it("weights full-word matches by field boost", () => {
            const doc = { title: "the garden", summary: "", text: "", author: "" };
            // title boost is 3.0, one matching word
            expect(wordMatchScore(["garden"], doc)).toBeCloseTo(3.0, 6);
        });

        it("strips HTML from the html field before matching", () => {
            const doc = { title: "", summary: "", text: "<p>garden</p>", author: "" };
            // text boost is 1.0
            expect(wordMatchScore(["garden"], doc)).toBeCloseTo(1.0, 6);
        });

        it("sums matches across fields", () => {
            const doc = { title: "garden", summary: "garden", text: "", author: "" };
            // title 3.0 + summary 1.5
            expect(wordMatchScore(["garden"], doc)).toBeCloseTo(4.5, 6);
        });

        it("returns 0 when there are no query words", () => {
            expect(wordMatchScore([], { title: "garden" })).toBe(0);
        });
    });
});
