import "fake-indexeddb/auto";
import { describe, it, expect, afterEach } from "vitest";
import { db, isConnected, syncActive } from "luminary-shared";
import { appLanguageIdsAsRef, cmsLanguages, initLanguage } from "@/globalConfig";
import { mockLanguageDtoEng } from "./tests/mockdata";
import waitForExpect from "wait-for-expect";

/**
 * `initLanguage()` is awaited in main.ts between `app.mount()` and
 * `isAppLoading.value = false`, so a promise that never settles here leaves the app on the
 * splash with sync, analytics and `markAppReady()` all stranded behind it. Language docs
 * arrive only through sync, so it resolves early on the conditions that mean none are
 * coming — no connection, or a sync pass that finished empty — rather than on a deadline.
 */

const settledWithin = (promise: Promise<unknown>, ms: number) =>
    Promise.race([
        promise.then(() => "settled" as const),
        new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), ms)),
    ]);

describe("initLanguage", () => {
    afterEach(async () => {
        await db.docs.clear();
        cmsLanguages.value.length = 0;
        isConnected.value = false;
        syncActive.value = false;
    });

    it("boots offline, where sync can never deliver languages", async () => {
        isConnected.value = false;

        expect(await settledWithin(initLanguage(), 500)).toBe("settled");
    });

    it("keeps waiting while a connection could still deliver them", async () => {
        isConnected.value = true;
        syncActive.value = true;

        // Nothing has ruled languages out yet, so boot must not continue without them.
        expect(await settledWithin(initLanguage(), 500)).toBe("pending");
    });

    it("boots once a sync pass has run and left the set empty", async () => {
        isConnected.value = true;
        syncActive.value = true;

        const pending = initLanguage();
        expect(await settledWithin(pending, 200)).toBe("pending");

        // The pass completes having delivered no Language docs: none are coming.
        syncActive.value = false;

        expect(await settledWithin(pending, 500)).toBe("settled");
    });

    it("resolves as soon as languages arrive", async () => {
        isConnected.value = true;
        syncActive.value = true;

        const pending = initLanguage();
        await db.docs.bulkPut([mockLanguageDtoEng]);

        expect(await settledWithin(pending, 2_000)).toBe("settled");
    });

    it("still normalizes the preferred languages once a later sync delivers them", async () => {
        isConnected.value = false;

        await initLanguage();
        await db.docs.bulkPut([mockLanguageDtoEng]);

        // The watcher is left live when boot continued without languages.
        await waitForExpect(() => {
            expect(appLanguageIdsAsRef.value).toContain(mockLanguageDtoEng._id);
        });
    });
});
