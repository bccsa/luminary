import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    appDisplayLanguageIdsAsRef,
    appLanguageAsRef,
    appLanguageIdsAsRef,
    appSyncedLanguageIdsAsRef,
    MAX_PREFERRED_LANGUAGES,
    MAX_SYNCED_LANGUAGES,
    normalizePreferredLanguages,
    normalizeSyncedLanguages,
    initLanguage,
    mediaQueue,
    addToMediaQueue,
    removeFromMediaQueue,
    clearMediaQueue,
    nextInMediaQueue,
    isInstalledStandalone,
} from "@/globalConfig";
import {
    mockEnglishContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
} from "./tests/mockdata";
import type { ContentDto } from "luminary-shared";
import { db } from "luminary-shared";
import waitForExpect from "wait-for-expect";

describe("globalConfig.ts", () => {
    beforeEach(async () => {
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        await db.docs.bulkPut([mockEnglishContentDto]);
        localStorage.clear();
        await initLanguage();
    });

    afterEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("can initialize the preferred language", async () => {
        await waitForExpect(() => {
            expect(appLanguageIdsAsRef.value).toContain(mockLanguageDtoEng._id);
        });
    });

    it("can return the preferred language document", async () => {
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        await waitForExpect(async () => {
            expect(appLanguageAsRef.value).toEqual(mockLanguageDtoEng);
        });
    });

    it("does NOT force the CMS default into the selected (synced) set", async () => {
        // The user selects a non-default language only; the default must not be appended to the
        // synced set (it is fetched on demand / kept as a fallback instead).
        appLanguageIdsAsRef.value = [mockLanguageDtoFra._id];
        await waitForExpect(() => {
            expect(appLanguageIdsAsRef.value).toEqual([mockLanguageDtoFra._id]);
        });
    });

    it("appDisplayLanguageIdsAsRef appends the CMS default as the display fallback", async () => {
        appLanguageIdsAsRef.value = [mockLanguageDtoFra._id];
        await waitForExpect(() => {
            // selected (fra) + default (eng) appended, default kept out of the synced set above.
            expect(appDisplayLanguageIdsAsRef.value).toEqual([
                mockLanguageDtoFra._id,
                mockLanguageDtoEng._id,
            ]);
        });
    });

    it("appDisplayLanguageIdsAsRef does not duplicate the default when already selected", async () => {
        appLanguageIdsAsRef.value = [mockLanguageDtoEng._id, mockLanguageDtoFra._id];
        await waitForExpect(() => {
            expect(appDisplayLanguageIdsAsRef.value).toEqual([
                mockLanguageDtoEng._id,
                mockLanguageDtoFra._id,
            ]);
        });
    });

    describe("normalizeSyncedLanguages", () => {
        it("force-includes the primary even from an empty synced set", () => {
            expect(normalizeSyncedLanguages([], ["fr", "sw"])).toEqual(["fr"]);
        });

        it("drops ids that are not in the preferred order", () => {
            expect(normalizeSyncedLanguages(["fr", "stale"], ["fr", "sw"])).toEqual(["fr"]);
        });

        it("keeps a valid ticked extra alongside the primary", () => {
            expect(normalizeSyncedLanguages(["fr", "sw"], ["fr", "sw"]).sort()).toEqual([
                "fr",
                "sw",
            ]);
        });

        it("on reorder, force-adds the new primary WITHOUT dropping previously-synced languages", () => {
            // synced was [fr]; user promotes sw to primary → order [sw, fr]. fr stays (sticky), sw added.
            expect(normalizeSyncedLanguages(["fr"], ["sw", "fr"])).toEqual(["sw", "fr"]);
        });

        it("returns an empty set only when there is no preferred order", () => {
            expect(normalizeSyncedLanguages(["fr"], [])).toEqual([]);
        });

        it("caps the synced set to MAX_SYNCED_LANGUAGES (keeping the primary)", () => {
            const order = ["a", "b", "c", "d"]; // preferred would itself be capped upstream
            const result = normalizeSyncedLanguages(["a", "b", "c", "d"], order);
            expect(result.length).toBe(MAX_SYNCED_LANGUAGES);
            expect(result).toContain("a"); // primary retained
        });
    });

    describe("normalizePreferredLanguages", () => {
        it("caps the preferred order to MAX_PREFERRED_LANGUAGES", () => {
            expect(normalizePreferredLanguages(["a", "b", "c", "d", "e"])).toEqual(
                ["a", "b", "c", "d", "e"].slice(0, MAX_PREFERRED_LANGUAGES),
            );
        });

        it("drops null/undefined ids and de-duplicates, preserving order", () => {
            expect(
                normalizePreferredLanguages([
                    "a",
                    null as unknown as string,
                    "a",
                    "b",
                    undefined as unknown as string,
                ]),
            ).toEqual(["a", "b"]);
        });

        it("is idempotent", () => {
            const once = normalizePreferredLanguages(["a", "b", "c", "d"]);
            expect(normalizePreferredLanguages(once)).toEqual(once);
        });
    });

    it("initLanguage seeds the synced set with the primary and persists it", async () => {
        await waitForExpect(() => {
            expect(appSyncedLanguageIdsAsRef.value.length).toBeGreaterThan(0);
            // always contains the primary (first preferred) language
            expect(appSyncedLanguageIdsAsRef.value).toContain(appLanguageIdsAsRef.value[0]);
        });
    });

    it("REGRESSION: the synced set reactively tracks the preferred order (never left empty)", async () => {
        // Guards the persistence-break root cause: an empty synced set at startup would skip
        // content sync. A module-load watcher keeps it normalized from the preferred order.
        appLanguageIdsAsRef.value = [mockLanguageDtoFra._id, mockLanguageDtoSwa._id];
        await waitForExpect(() => {
            // synced defaults to the primary of the preferred order — non-empty.
            expect(appSyncedLanguageIdsAsRef.value).toContain(mockLanguageDtoFra._id);
        });

        // Promote a new primary → the synced set picks it up (offline baseline follows the primary).
        appLanguageIdsAsRef.value = [mockLanguageDtoSwa._id, mockLanguageDtoFra._id];
        await waitForExpect(() => {
            expect(appSyncedLanguageIdsAsRef.value).toContain(mockLanguageDtoSwa._id);
        });
    });

    describe("media queue", () => {
        const contentWithAudio = {
            ...mockEnglishContentDto,
            _id: "content-audio-1",
        } as ContentDto;

        const contentWithAudio2 = {
            ...mockEnglishContentDto,
            _id: "content-audio-2",
        } as ContentDto;

        const contentWithAudio3 = {
            ...mockEnglishContentDto,
            _id: "content-audio-3",
        } as ContentDto;

        const contentWithoutAudio = {
            ...mockEnglishContentDto,
            _id: "content-no-audio",
            parentMedia: undefined,
        } as unknown as ContentDto;

        beforeEach(() => {
            clearMediaQueue();
        });

        it("addToMediaQueue adds content with audio files to front of queue", () => {
            addToMediaQueue(contentWithAudio);
            expect(mediaQueue.value).toHaveLength(1);
            expect(mediaQueue.value[0]._id).toBe("content-audio-1");

            addToMediaQueue(contentWithAudio2);
            expect(mediaQueue.value).toHaveLength(2);
            expect(mediaQueue.value[0]._id).toBe("content-audio-2");
        });

        it("addToMediaQueue warns when content has no audio files", () => {
            const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
            addToMediaQueue(contentWithoutAudio);
            expect(consoleSpy).toHaveBeenCalledWith("Content has no audio files to play");
            expect(mediaQueue.value).toHaveLength(0);
            consoleSpy.mockRestore();
        });

        it("addToMediaQueue moves existing content to front when already in queue", () => {
            addToMediaQueue(contentWithAudio);
            addToMediaQueue(contentWithAudio2);
            addToMediaQueue(contentWithAudio3);
            expect(mediaQueue.value[0]._id).toBe("content-audio-3");

            // Add contentWithAudio again - should move to front
            addToMediaQueue(contentWithAudio);
            expect(mediaQueue.value).toHaveLength(3);
            expect(mediaQueue.value[0]._id).toBe("content-audio-1");
        });

        it("removeFromMediaQueue removes content by ID", () => {
            addToMediaQueue(contentWithAudio);
            addToMediaQueue(contentWithAudio2);
            expect(mediaQueue.value).toHaveLength(2);

            removeFromMediaQueue("content-audio-1");
            expect(mediaQueue.value).toHaveLength(1);
            expect(mediaQueue.value[0]._id).toBe("content-audio-2");
        });

        it("removeFromMediaQueue does nothing for non-existent ID", () => {
            addToMediaQueue(contentWithAudio);
            expect(mediaQueue.value).toHaveLength(1);

            removeFromMediaQueue("non-existent-id");
            expect(mediaQueue.value).toHaveLength(1);
        });

        it("clearMediaQueue empties the queue", () => {
            addToMediaQueue(contentWithAudio);
            addToMediaQueue(contentWithAudio2);
            expect(mediaQueue.value).toHaveLength(2);

            clearMediaQueue();
            expect(mediaQueue.value).toHaveLength(0);
        });

        it("nextInMediaQueue shifts first item when queue has more than 1 item", () => {
            addToMediaQueue(contentWithAudio);
            addToMediaQueue(contentWithAudio2);
            expect(mediaQueue.value).toHaveLength(2);

            nextInMediaQueue();
            expect(mediaQueue.value).toHaveLength(1);
            expect(mediaQueue.value[0]._id).toBe("content-audio-1");
        });

        it("nextInMediaQueue clears queue when only 1 item left", () => {
            addToMediaQueue(contentWithAudio);
            expect(mediaQueue.value).toHaveLength(1);

            nextInMediaQueue();
            expect(mediaQueue.value).toHaveLength(0);
        });
    });

    describe("isInstalledStandalone", () => {
        const originalMatchMedia = window.matchMedia;

        afterEach(() => {
            window.matchMedia = originalMatchMedia;
            delete (window.navigator as any).standalone;
        });

        const mockMatchMedia = (standaloneMatches: boolean) => {
            window.matchMedia = vi.fn().mockImplementation((query: string) => ({
                matches: query === "(display-mode: standalone)" && standaloneMatches,
                media: query,
                onchange: null,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }));
        };

        it("returns false in a normal browser tab", () => {
            // The global vitest.setup stub makes matchMedia report matches: false.
            expect(isInstalledStandalone()).toBe(false);
        });

        it("returns true when launched in display-mode: standalone", () => {
            mockMatchMedia(true);
            expect(isInstalledStandalone()).toBe(true);
        });

        it("returns true for iOS home-screen apps (navigator.standalone)", () => {
            (window.navigator as any).standalone = true;
            expect(isInstalledStandalone()).toBe(true);
        });
    });
});
