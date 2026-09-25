import { describe, it, expect, vi, beforeEach } from "vitest";
import { nextTick, ref } from "vue";

const syncActive = ref(false);
vi.mock("luminary-shared", () => ({ syncActive }));

const appSyncedLanguageIdsAsRef = ref<string[]>([]);
vi.mock("@/globalConfig", () => ({ appSyncedLanguageIdsAsRef }));

// `localCorpusSettled` latches for the session, so each case needs a fresh module.
async function loadSubject() {
    vi.resetModules();
    return await import("./syncReadiness");
}

describe("syncReadiness", () => {
    beforeEach(() => {
        syncActive.value = false;
        appSyncedLanguageIdsAsRef.value = ["lang-eng"];
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

    it("ignores a sync pass that ran before any language was selected for sync", async () => {
        // `initSync` skips content while the synced set is empty, so this pass carried languages
        // and auth providers only — the content corpus is still untouched.
        appSyncedLanguageIdsAsRef.value = [];
        const { localCorpusSettled, initSyncReadiness } = await loadSubject();
        initSyncReadiness();

        syncActive.value = true;
        await nextTick();
        syncActive.value = false;
        await nextTick();
        expect(localCorpusSettled.value).toBe(false);

        // Those languages are what unblocks content sync; the pass that follows is the one
        // whose completion makes an empty read authoritative.
        appSyncedLanguageIdsAsRef.value = ["lang-eng"];
        syncActive.value = true;
        await nextTick();
        syncActive.value = false;
        await nextTick();
        expect(localCorpusSettled.value).toBe(true);
    });

    it("settles anyway when a started content sync pass never reports completion", async () => {
        vi.useFakeTimers();
        try {
            const { localCorpusSettled, initSyncReadiness } = await loadSubject();
            initSyncReadiness();

            // A stalled or errored runner leaves `syncActive` stuck true. Holding the seed for the
            // whole session would also stop local deletions reaching every seeded query.
            syncActive.value = true;
            await nextTick();
            expect(localCorpusSettled.value).toBe(false);

            vi.advanceTimersByTime(60_000);
            expect(localCorpusSettled.value).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it("does not arm the stall fallback while no language is selected for sync", async () => {
        vi.useFakeTimers();
        try {
            appSyncedLanguageIdsAsRef.value = [];
            const { localCorpusSettled, initSyncReadiness } = await loadSubject();
            initSyncReadiness();

            // This pass can't be filling the content corpus, so its duration says nothing about
            // whether an empty read is authoritative.
            syncActive.value = true;
            await nextTick();
            vi.advanceTimersByTime(60_000);
            expect(localCorpusSettled.value).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });
});
