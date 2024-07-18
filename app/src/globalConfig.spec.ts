import "fake-indexeddb/auto";
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import {
    apiUrl,
    appLanguageAsRef,
    appLanguageIdAsRef,
    appName,
    initLanguage,
    isDevMode,
} from "@/globalConfig";
import { mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa } from "./tests/mockdata";
import { db } from "luminary-shared";
import waitForExpect from "wait-for-expect";

describe("globalConfig.ts", () => {
    beforeAll(async () => {
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        initLanguage();
    });
    afterAll(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("initializes with the correct environment variables", () => {
        // Expect the values from .env.example to be returned
        expect(appName).toBe("Luminary App");
        expect(apiUrl).toBe("http://localhost:3000");
        expect(isDevMode).toBe(true);
    });

    it("can initialize the preferred language", async () => {
        await waitForExpect(() => {
            expect(appLanguageIdAsRef.value).toBe(mockLanguageDtoEng._id);
        });
    });

    it("can return the preferred language document", async () => {
        await waitForExpect(() => {
            expect(appLanguageAsRef.value).toEqual(mockLanguageDtoEng);
        });
    });
});
