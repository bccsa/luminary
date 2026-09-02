import "fake-indexeddb/auto";
import { describe, it, expect, afterEach } from "vitest";
import { db } from "luminary-shared";
import { appLanguageIdsAsRef, initLanguage } from "@/globalConfig";
import { mockLanguageDtoEng } from "./tests/mockdata";
import waitForExpect from "wait-for-expect";

/**
 * `initLanguage()` is awaited in main.ts between `app.mount()` and
 * `isAppLoading.value = false`, so a promise that never settles here leaves the app on
 * the splash with sync, analytics and `markAppReady()` all stranded behind it. Language
 * docs arrive only through sync, which is gated on the socket, so an offline cold start
 * has no way to satisfy it.
 */

const settledWithin = (promise: Promise<unknown>, ms: number) =>
    Promise.race([
        promise.then(() => "settled" as const),
        new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), ms)),
    ]);

describe("initLanguage", () => {
    afterEach(async () => {
        await db.docs.clear();
    });

    it("resolves without Language docs so an offline cold start still boots", async () => {
        await db.docs.clear();

        expect(await settledWithin(initLanguage(), 15_000)).toBe("settled");
    });

    it("still normalizes the preferred languages once a later sync delivers them", async () => {
        await db.docs.clear();

        await initLanguage();
        await db.docs.bulkPut([mockLanguageDtoEng]);

        // The watcher is left live when boot continued without languages.
        await waitForExpect(() => {
            expect(appLanguageIdsAsRef.value).toContain(mockLanguageDtoEng._id);
        });
    });
});
