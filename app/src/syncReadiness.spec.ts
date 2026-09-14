import { describe, it, expect, vi, beforeEach } from "vitest";
import { nextTick, ref } from "vue";

const syncActive = ref(false);
vi.mock("luminary-shared", () => ({ syncActive }));

// `localCorpusSettled` latches for the session, so each case needs a fresh module.
async function loadSubject() {
    vi.resetModules();
    return await import("./syncReadiness");
}

describe("syncReadiness", () => {
    beforeEach(() => {
        syncActive.value = false;
    });

    it("starts unsettled so a cold start's empty reads aren't treated as authoritative", async () => {
        const { localCorpusSettled, initSyncReadiness } = await loadSubject();
        initSyncReadiness();

        // Sync hasn't begun yet — `syncActive` is false here for the same reason it is false
        // when everything is finished, which is why this can't just mirror it.
        expect(localCorpusSettled.value).toBe(false);
    });

    it("settles once a sync pass has run to completion", async () => {
        const { localCorpusSettled, initSyncReadiness } = await loadSubject();
        initSyncReadiness();

        syncActive.value = true;
        await nextTick();
        expect(localCorpusSettled.value).toBe(false);

        syncActive.value = false;
        await nextTick();
        expect(localCorpusSettled.value).toBe(true);
    });

    it("stays settled when a later sync pass starts", async () => {
        const { localCorpusSettled, initSyncReadiness } = await loadSubject();
        initSyncReadiness();
        syncActive.value = true;
        await nextTick();
        syncActive.value = false;
        await nextTick();

        // Reopening the window would let a feed that has legitimately emptied show stale docs.
        syncActive.value = true;
        await nextTick();
        expect(localCorpusSettled.value).toBe(true);
    });

    it("never settles for a client whose sync never runs", async () => {
        const { localCorpusSettled, initSyncReadiness } = await loadSubject();
        initSyncReadiness();

        // Offline first visit: the prerendered tiles are the best data available, so they stay.
        await nextTick();
        expect(localCorpusSettled.value).toBe(false);
    });
});
