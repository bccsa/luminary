import { describe, it, expect, vi, afterEach } from "vitest";
import { mangoIsPublished } from "./mangoIsPublished";
import { __resetSessionNow } from "./sessionNow";
import { mangoCompile, type MangoSelector, PublishStatus } from "luminary-shared";

/**
 * Helper: compile mangoIsPublished conditions into a predicate.
 * Wraps the returned conditions array in an $and selector, matching
 * how the function is intended to be used.
 */
function buildPredicate(languageIds: string[], includeScheduled?: boolean) {
    const conditions =
        includeScheduled === undefined
            ? mangoIsPublished(languageIds)
            : mangoIsPublished(languageIds, { includeScheduled });
    const selector: MangoSelector = { $and: conditions };
    return mangoCompile(selector);
}

/** Helper: create a minimal document with the given overrides. */
function makeDoc(overrides: Record<string, unknown> = {}) {
    return {
        status: PublishStatus.Published,
        publishDate: Date.now() - 100_000, // in the past
        language: "lang-eng",
        availableTranslations: ["lang-eng"],
        ...overrides,
    };
}

describe("mangoIsPublished", () => {
    afterEach(() => {
        // Re-capture on the next call (models a fresh page load) and undo any fake
        // clock so a frozen fake instant can't bleed into a later real-timer test.
        __resetSessionNow();
        vi.useRealTimers();
    });

    // ============================================
    // Frozen session reference time (stable reactive query key)
    // ============================================
    //
    // The publish/expiry bounds are embedded in the selector, which HybridQuery
    // serializes as its reactive query key. Pinning "now" to one value captured on
    // page load keeps that key byte-stable, so the API supplement POST isn't
    // re-issued on every tracked-ref change (only `now` differed before).

    describe("session reference time", () => {
        /** Pull the numeric `now` bound out of the expiryDate `$gte` condition. */
        function expiryNow(conditions: MangoSelector[]): number {
            // Conditions: [status, publishDate, expiryDate, language]
            const expiry = conditions[2] as { $or: Array<Record<string, any>> };
            const gte = expiry.$or.find((c) => c.expiryDate?.$gte !== undefined);
            return gte!.expiryDate.$gte;
        }

        it("produces an identical selector even after the clock advances", () => {
            vi.useFakeTimers();
            vi.setSystemTime(1_700_000_000_000);
            __resetSessionNow();

            const first = mangoIsPublished(["lang-eng"]); // captures now here
            vi.setSystemTime(1_700_000_000_000 + 10 * 60_000); // +10 minutes
            const second = mangoIsPublished(["lang-eng"]);

            expect(JSON.stringify(first)).toBe(JSON.stringify(second));
        });

        it("freezes the now bound to the page-load instant", () => {
            vi.useFakeTimers();
            vi.setSystemTime(1_700_000_037_123);
            __resetSessionNow();

            const now = expiryNow(mangoIsPublished(["lang-eng"]));

            expect(now).toBe(1_700_000_037_123);
        });

        it("re-captures the now bound on a fresh load (reset)", () => {
            vi.useFakeTimers();
            vi.setSystemTime(1_700_000_000_000);
            __resetSessionNow();
            const before = expiryNow(mangoIsPublished(["lang-eng"]));

            __resetSessionNow(); // simulate a fresh page load
            vi.setSystemTime(1_700_000_500_000);
            const after = expiryNow(mangoIsPublished(["lang-eng"]));

            expect(after - before).toBe(500_000);
        });
    });

    // ============================================
    // Publish date checks
    // ============================================

    describe("publishDate", () => {
        it("matches a document with publishDate in the past", () => {
            const pred = buildPredicate(["lang-eng"]);
            const doc = makeDoc({ publishDate: Date.now() - 100_000 });

            expect(pred(doc)).toBe(true);
        });

        it("matches a document with publishDate at the session reference instant", () => {
            vi.useFakeTimers();
            vi.setSystemTime(1_700_000_000_000);
            __resetSessionNow();

            const pred = buildPredicate(["lang-eng"]); // captures now = reference instant
            const doc = makeDoc({ publishDate: 1_700_000_000_000 }); // exactly now → $lte matches

            expect(pred(doc)).toBe(true);
        });

        it("rejects a document with publishDate in the future", () => {
            const pred = buildPredicate(["lang-eng"]);
            const doc = makeDoc({ publishDate: Date.now() + 1_000_000 });

            expect(pred(doc)).toBe(false);
        });

        // Published content always carries a numeric publishDate (API-enforced), so the
        // filter no longer matches missing/null publishDate — those branches were dead
        // weight that defeated CouchDB's publishDate index range.
        it("rejects a document with no publishDate (published content always has one)", () => {
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

        it("rejects a document with status draft", () => {
            const pred = buildPredicate(["lang-eng"]);
            const doc = makeDoc({ status: PublishStatus.Draft });

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
            expect(conditions.length).toBe(4); // status, publishDate, expiryDate, language priority
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

    // ============================================
    // includeScheduled (coming-soon / scheduled tiles)
    // ============================================

    describe("includeScheduled", () => {
        it("matches already-published content (past publishDate)", () => {
            const pred = buildPredicate(["lang-eng"]);
            const doc = makeDoc({ publishDate: Date.now() - 60_000 });
            expect(pred(doc)).toBe(true);
        });

        it("matches scheduled content by default", () => {
            const pred = buildPredicate(["lang-eng"]);
            const doc = makeDoc({ publishDate: Date.now() + 60_000, parentShowComingSoon: true });
            expect(pred(doc)).toBe(true);
        });

        it("rejects future publishDate when parentShowComingSoon is not true (omitted)", () => {
            const pred = buildPredicate(["lang-eng"]);
            const doc = makeDoc({ publishDate: Date.now() + 60_000 });
            expect(pred(doc)).toBe(false);
        });

        it("rejects scheduled content when includeScheduled is false", () => {
            const pred = buildPredicate(["lang-eng"], false);
            const doc = makeDoc({ publishDate: Date.now() + 60_000, parentShowComingSoon: true });
            expect(pred(doc)).toBe(false);
        });

        it("rejects expired content", () => {
            const pred = buildPredicate(["lang-eng"]);
            const doc = makeDoc({
                publishDate: Date.now() + 60_000,
                parentShowComingSoon: true,
                expiryDate: 0,
            });
            expect(pred(doc)).toBe(false);
        });

        it("rejects draft content", () => {
            const pred = buildPredicate(["lang-eng"]);
            const doc = makeDoc({ status: PublishStatus.Draft });
            expect(pred(doc)).toBe(false);
        });
    });
});
