import "fake-indexeddb/auto";
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { appLanguageAsRef, appLanguageIdAsRef, initLanguage } from "@/globalConfig";
import { mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa } from "./tests/mockdata";
import { luminary } from "@/main";
import waitForExpect from "wait-for-expect";

describe("globalConfig.ts", () => {
    beforeAll(async () => {
        await luminary.db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        initLanguage();
    });
    afterAll(async () => {
        await luminary.db.docs.clear();
        await luminary.db.localChanges.clear();
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
