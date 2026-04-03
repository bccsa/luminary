import { describe, it, expect } from "vitest";
import { mangoIsPublishedOrScheduled } from "./mangoIsPublished";
import { mangoCompile, type MangoSelector, PublishStatus } from "luminary-shared";

function buildPredicate(languageIds: string[]) {
    const conditions = mangoIsPublishedOrScheduled(languageIds);
    const selector: MangoSelector = { $and: conditions };
    return mangoCompile(selector);
}

function makeDoc(overrides: Record<string, unknown> = {}) {
    return {
        status: PublishStatus.Published,
        // Default publishDate is in the past (treated as published).
        publishDate: Date.now() - 1_000,
        language: "lang-eng",
        availableTranslations: ["lang-eng"],
        ...overrides,
    };
}

describe("mangoIsPublishedOrScheduled", () => {
    it("matches already-published content (past publishDate)", () => {
        const pred = buildPredicate(["lang-eng"]);
        const doc = makeDoc({ publishDate: Date.now() - 60_000 });
        expect(pred(doc)).toBe(true);
    });

    it("matches scheduled content when parentShowComingSoon is true", () => {
        const pred = buildPredicate(["lang-eng"]);
        const doc = makeDoc({ publishDate: Date.now() + 60_000, parentShowComingSoon: true });
        expect(pred(doc)).toBe(true);
    });

    it("rejects scheduled content when parentShowComingSoon is false", () => {
        const pred = buildPredicate(["lang-eng"]);
        const doc = makeDoc({ publishDate: Date.now() + 60_000, parentShowComingSoon: false });
        expect(pred(doc)).toBe(false);
    });

    it("rejects scheduled content when parentShowComingSoon is absent", () => {
        const pred = buildPredicate(["lang-eng"]);
        const doc = makeDoc({ publishDate: Date.now() + 60_000 });
        expect(pred(doc)).toBe(false);
    });

    it("rejects expired content", () => {
        const pred = buildPredicate(["lang-eng"]);
        const doc = makeDoc({ publishDate: Date.now() + 60_000, parentShowComingSoon: true, expiryDate: 0 });
        expect(pred(doc)).toBe(false);
    });

    it("rejects draft content", () => {
        const pred = buildPredicate(["lang-eng"]);
        const doc = makeDoc({ status: PublishStatus.Draft });
        expect(pred(doc)).toBe(false);
    });
});

