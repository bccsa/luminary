import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cmsDefaultLanguage, cmsLanguageIdAsRef, cmsLanguages, initLanguage } from "@/globalConfig";
import {
    mockEnglishContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
} from "./tests/mockdata";
import { db, type LanguageDto } from "luminary-shared";
import waitForExpect from "wait-for-expect";

describe("globalConfig.ts", () => {
    beforeEach(async () => {
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        await db.docs.bulkPut([mockEnglishContentDto]);
        await initLanguage();
    });

    afterEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("can initialize the preferred language", async () => {
        await waitForExpect(() => {
            expect(cmsLanguageIdAsRef.value).toContain(mockLanguageDtoEng._id);
        });
    });

    it("can return the preferred language document", async () => {
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        await waitForExpect(async () => {
            expect(cmsDefaultLanguage.value).toEqual(mockLanguageDtoEng);
        });
    });

    it("can return the matching browser language", async () => {
        // Simulate browser pref = French
        Object.defineProperty(global.navigator, "languages", {
            get: () => ["fr-FR"],
            configurable: true,
        });

        await db.docs.clear();
        await db.docs.bulkPut([mockLanguageDtoFra, mockLanguageDtoEng, mockLanguageDtoSwa]);

        // Reset state so initLanguage() does not bail out
        cmsLanguageIdAsRef.value = "";
        cmsLanguages.value = [];

        await initLanguage();

        await waitForExpect(() => {
            expect(cmsLanguageIdAsRef.value).toBe(mockLanguageDtoFra._id);
        });
    });

    it("can return the default language if no matching browser language", async () => {
        // Simulate browser pref = Spanish (not available)
        Object.defineProperty(global.navigator, "languages", {
            value: ["es-ES"],
            configurable: true,
        });

        await db.docs.clear();
        // mark French as default
        await db.docs.bulkPut([
            { ...mockLanguageDtoEng, default: 0 } as LanguageDto,
            { ...mockLanguageDtoFra, default: 1 },
            { ...mockLanguageDtoSwa, default: 0 },
        ]);

        cmsLanguageIdAsRef.value = ""; // reset
        await initLanguage();

        await waitForExpect(() => {
            expect(cmsLanguageIdAsRef.value).toBe(mockLanguageDtoFra._id);
        });
    });

    it("can return the first language if no matching browser and no default language", async () => {
        // Simulate browser pref = Spanish (not available)
        Object.defineProperty(global.navigator, "languages", {
            value: ["nb-NO"],
            configurable: true,
        });

        await db.docs.clear();
        // no default set
        await db.docs.bulkPut([
            { ...mockLanguageDtoSwa, default: 0 } as LanguageDto,
            { ...mockLanguageDtoFra, default: 0 },
            { ...mockLanguageDtoEng, default: 0 },
        ]);

        cmsLanguageIdAsRef.value = ""; // reset
        await initLanguage();

        await waitForExpect(() => {
            // Should fall back to first in DB order (mockLanguageDtoEng in this case)
            expect(cmsLanguageIdAsRef.value).toBe(mockLanguageDtoSwa._id);
        });
    });
});
