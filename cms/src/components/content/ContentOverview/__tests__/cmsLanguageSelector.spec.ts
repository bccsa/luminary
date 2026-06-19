import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { PublishStatus } from "luminary-shared";
import {
    buildLanguagePrioritySelector,
    cmsLanguagePriority,
    translationStatusSelector,
    publishStatusSelector,
    isUntranslatedRow,
} from "../cmsLanguageSelector";
import { cmsLanguageIdAsRef, cmsDefaultLanguage, cmsLanguages } from "@/globalConfig";
import { sessionNow } from "@/util/sessionNow";
import type { LanguageDto } from "luminary-shared";

const lang = (id: string): LanguageDto => ({ _id: id }) as LanguageDto;

describe("cmsLanguageSelector", () => {
    describe("buildLanguagePrioritySelector", () => {
        it("matches any document when no languages are given", () => {
            expect(buildLanguagePrioritySelector([])).toEqual({});
        });

        it("matches the language directly for a single language", () => {
            const sel = buildLanguagePrioritySelector(["lang-eng"]) as any;
            expect(sel.$or[0]).toEqual({ language: "lang-eng" });
        });

        it("falls back to lower-priority languages only when higher ones are unavailable", () => {
            const sel = buildLanguagePrioritySelector(["lang-eng", "lang-fra"]) as any;
            // First option: exact selected language.
            expect(sel.$or[0]).toEqual({ language: "lang-eng" });
            // Second option: french only when english is not an available translation.
            expect(sel.$or[1]).toEqual({
                $and: [
                    { language: "lang-fra" },
                    { $not: { availableTranslations: { $elemMatch: { $eq: "lang-eng" } } } },
                ],
            });
            // Final fallback: a doc with none of the preferred languages available.
            expect(sel.$or[sel.$or.length - 1]).toEqual({
                $and: [
                    { $not: { availableTranslations: { $elemMatch: { $eq: "lang-eng" } } } },
                    { $not: { availableTranslations: { $elemMatch: { $eq: "lang-fra" } } } },
                ],
            });
        });
    });

    describe("cmsLanguagePriority", () => {
        beforeEach(() => {
            cmsLanguageIdAsRef.value = "";
            cmsDefaultLanguage.value = undefined;
            cmsLanguages.value = [];
        });

        it("orders working language, then default, then the rest (deduped)", () => {
            cmsLanguageIdAsRef.value = "lang-fra";
            cmsDefaultLanguage.value = lang("lang-eng");
            cmsLanguages.value = [lang("lang-eng"), lang("lang-fra"), lang("lang-swa")];

            expect(cmsLanguagePriority()).toEqual(["lang-fra", "lang-eng", "lang-swa"]);
        });

        it("skips missing values", () => {
            cmsLanguageIdAsRef.value = "lang-swa";
            cmsDefaultLanguage.value = undefined;
            cmsLanguages.value = [lang("lang-swa")];

            expect(cmsLanguagePriority()).toEqual(["lang-swa"]);
        });
    });

    describe("translationStatusSelector", () => {
        beforeEach(() => {
            cmsLanguageIdAsRef.value = "lang-eng";
            cmsDefaultLanguage.value = lang("lang-eng");
            cmsLanguages.value = [lang("lang-eng"), lang("lang-fra")];
        });

        it("matches the selected language exactly for 'translated'", () => {
            expect(translationStatusSelector("translated", "lang-eng")).toEqual({
                language: "lang-eng",
            });
        });

        it("uses the priority fallback for 'all' and 'untranslated'", () => {
            const all = translationStatusSelector("all", "lang-eng") as any;
            const untranslated = translationStatusSelector("untranslated", "lang-eng") as any;
            expect(all.$or).toBeDefined();
            expect(untranslated.$or).toEqual(all.$or);
        });
    });

    describe("isUntranslatedRow", () => {
        it("keeps non-selected-language rows whose parent lacks the selected translation", () => {
            expect(
                isUntranslatedRow(
                    { language: "lang-fra", availableTranslations: ["lang-fra"] },
                    "lang-eng",
                ),
            ).toBe(true);
        });

        it("drops the selected-language row", () => {
            expect(isUntranslatedRow({ language: "lang-eng" }, "lang-eng")).toBe(false);
        });

        it("drops rows whose parent IS translated to the selected language", () => {
            expect(
                isUntranslatedRow(
                    { language: "lang-fra", availableTranslations: ["lang-fra", "lang-eng"] },
                    "lang-eng",
                ),
            ).toBe(false);
        });
    });

    describe("publishStatusSelector", () => {
        it("returns no clauses for 'all' / undefined", () => {
            expect(publishStatusSelector("all")).toEqual([]);
            expect(publishStatusSelector(undefined)).toEqual([]);
        });

        it("filters drafts by status only", () => {
            expect(publishStatusSelector("draft")).toEqual([{ status: PublishStatus.Draft }]);
        });

        it("filters published by status, publishDate and expiry", () => {
            const now = sessionNow();
            expect(publishStatusSelector("published")).toEqual([
                { status: PublishStatus.Published },
                { publishDate: { $lte: now } },
                {
                    $or: [
                        { expiryDate: { $exists: false } },
                        { expiryDate: null },
                        { expiryDate: { $gt: now } },
                    ],
                },
            ]);
        });

        it("filters scheduled by future publishDate", () => {
            const now = sessionNow();
            expect(publishStatusSelector("scheduled")).toEqual([
                { status: PublishStatus.Published },
                { publishDate: { $gt: now } },
            ]);
        });

        it("filters expired by past expiryDate", () => {
            const now = sessionNow();
            expect(publishStatusSelector("expired")).toEqual([
                { status: PublishStatus.Published },
                { expiryDate: { $lte: now } },
            ]);
        });
    });
});
