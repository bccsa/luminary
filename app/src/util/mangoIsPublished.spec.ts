import { describe, it, expect } from "vitest";
import { mangoIsPublished } from "./mangoIsPublished";
import { mangoCompile, type MangoSelector } from "luminary-shared";

/**
 * Helper: compile mangoIsPublished conditions into a predicate.
 * Wraps the returned conditions array in an $and selector, matching
 * how the function is intended to be used.
 */
function buildPredicate(languageIds: string[]) {
    const conditions = mangoIsPublished(languageIds);
    const selector: MangoSelector = { $and: conditions };
    return mangoCompile(selector);
}

/** Helper: create a minimal document with the given overrides. */
function makeDoc(overrides: Record<string, unknown> = {}) {
    return {
        publishDate: Date.now() - 100_000, // in the past
        language: "lang-eng",
        availableTranslations: ["lang-eng"],
        ...overrides,
    };
}

describe("mangoIsPublished", () => {
    // ============================================
    // Publish date checks
    // ============================================

    describe("publishDate", () => {
        it("matches a document with publishDate in the past", () => {
            const pred = buildPredicate(["lang-eng"]);
            const doc = makeDoc({ publishDate: Date.now() - 100_000 });

            expect(pred(doc)).toBe(true);
        });

        it("matches a document with publishDate equal to now (approximately)", () => {
            const pred = buildPredicate(["lang-eng"]);
            // Use a date very slightly in the past to avoid timing issues
            const doc = makeDoc({ publishDate: Date.now() - 1 });

            expect(pred(doc)).toBe(true);
        });

        it("rejects a document with publishDate in the future", () => {
            const pred = buildPredicate(["lang-eng"]);
            const doc = makeDoc({ publishDate: Date.now() + 1_000_000 });

            expect(pred(doc)).toBe(false);
        });

        it("rejects a document with no publishDate", () => {
            const pred = buildPredicate(["lang-eng"]);
            const doc = makeDoc();
            delete (doc as any).publishDate;

            expect(pred(doc)).toBe(false);
        });

        it("rejects a document with publishDate set to null", () => {
            const pred = buildPredicate(["lang-eng"]);
            const doc = makeDoc({ publishDate: null });

            expect(pred(doc)).toBe(false);
        });
    });

    // ============================================
    // Expiry date checks
    // ============================================

    describe("expiryDate", () => {
        it("matches a document with no expiryDate", () => {
            const pred = buildPredicate(["lang-eng"]);
            const doc = makeDoc(); // no expiryDate field

            expect(pred(doc)).toBe(true);
        });

        it("matches a document with expiryDate set to null", () => {
            const pred = buildPredicate(["lang-eng"]);
            const doc = makeDoc({ expiryDate: null });

            expect(pred(doc)).toBe(true);
        });

        it("matches a document with expiryDate in the future", () => {
            const pred = buildPredicate(["lang-eng"]);
            const doc = makeDoc({ expiryDate: Date.now() + 1_000_000 });

            expect(pred(doc)).toBe(true);
        });

        it("rejects a document with expiryDate in the past", () => {
            const pred = buildPredicate(["lang-eng"]);
            const doc = makeDoc({ expiryDate: 1000 }); // far in the past

            expect(pred(doc)).toBe(false);
        });
    });

    // ============================================
    // Language priority checks
    // ============================================

    describe("language priority", () => {
        it("matches a document in the first preferred language", () => {
            const pred = buildPredicate(["lang-eng", "lang-fra"]);
            const doc = makeDoc({
                language: "lang-eng",
                availableTranslations: ["lang-eng", "lang-fra"],
            });

            expect(pred(doc)).toBe(true);
        });

        it("rejects a second-language document when the first language is available", () => {
            const pred = buildPredicate(["lang-eng", "lang-fra"]);
            const doc = makeDoc({
                language: "lang-fra",
                availableTranslations: ["lang-eng", "lang-fra"],
            });

            // Should reject because lang-eng is available and is higher priority
            expect(pred(doc)).toBe(false);
        });

        it("matches a second-language document when the first language is NOT available", () => {
            const pred = buildPredicate(["lang-eng", "lang-fra"]);
            const doc = makeDoc({
                language: "lang-fra",
                availableTranslations: ["lang-fra"],
            });

            expect(pred(doc)).toBe(true);
        });

        it("matches a third-language document when higher-priority languages are not available", () => {
            const pred = buildPredicate(["lang-eng", "lang-fra", "lang-swa"]);
            const doc = makeDoc({
                language: "lang-swa",
                availableTranslations: ["lang-swa"],
            });

            expect(pred(doc)).toBe(true);
        });

        it("rejects a third-language document when a higher-priority language is available", () => {
            const pred = buildPredicate(["lang-eng", "lang-fra", "lang-swa"]);
            const doc = makeDoc({
                language: "lang-swa",
                availableTranslations: ["lang-fra", "lang-swa"],
            });

            // lang-fra is higher priority than lang-swa and is available
            expect(pred(doc)).toBe(false);
        });

        it("falls back to any language when no preferred languages are available", () => {
            const pred = buildPredicate(["lang-eng", "lang-fra"]);
            const doc = makeDoc({
                language: "lang-swa",
                availableTranslations: ["lang-swa"], // neither eng nor fra
            });

            expect(pred(doc)).toBe(true);
        });

        it("matches any document when languageIds is empty", () => {
            const pred = buildPredicate([]);
            const doc = makeDoc({ language: "lang-swa" });

            expect(pred(doc)).toBe(true);
        });
    });

    // ============================================
    // Return value structure
    // ============================================

    describe("return value", () => {
        it("returns an array of MangoSelector conditions", () => {
            const conditions = mangoIsPublished(["lang-eng"]);

            expect(Array.isArray(conditions)).toBe(true);
            expect(conditions.length).toBe(3); // publishDate, expiryDate, language priority
        });

        it("conditions can be spread into an $and clause", () => {
            const conditions = mangoIsPublished(["lang-eng"]);
            const selector: MangoSelector = {
                $and: [{ type: "content" }, ...conditions],
            };

            const pred = mangoCompile(selector);
            const doc = makeDoc({ type: "content" });
            expect(pred(doc)).toBe(true);

            const wrongType = makeDoc({ type: "tag" });
            expect(pred(wrongType)).toBe(false);
        });
    });
});
