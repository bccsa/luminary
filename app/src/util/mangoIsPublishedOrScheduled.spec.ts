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
        // Default publishDate is "now" (treated as visible either way).
        publishDate: Date.now(),
        language: "lang-eng",
        availableTranslations: ["lang-eng"],
        ...overrides,
    };
}

describe("mangoIsPublishedOrScheduled", () => {
    it("matches scheduled content with publishDate in the future", () => {
        const pred = buildPredicate(["lang-eng"]);
        const doc = makeDoc({ publishDate: Date.now() + 60_000 });
        expect(pred(doc)).toBe(true);
    });

    it("rejects expired content", () => {
        const pred = buildPredicate(["lang-eng"]);
        // Use a far-in-the-past expiry date to avoid timing flakiness.
        const doc = makeDoc({ publishDate: Date.now() + 60_000, expiryDate: 0 });
        expect(pred(doc)).toBe(false);
    });

    it("rejects draft content", () => {
        const pred = buildPredicate(["lang-eng"]);
        const doc = makeDoc({ status: PublishStatus.Draft });
        expect(pred(doc)).toBe(false);
    });
});

