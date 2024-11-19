import "fake-indexeddb/auto";
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import {
    appLanguageAsRef,
    appLanguageIdAsRef,
    initLanguage,
    setMediaProgress,
    getMediaProgress,
    removeMediaProgress,
    userPreferencesAsRef,
} from "@/globalConfig";
import {
    mockEnglishContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
} from "./tests/mockdata";
import { db } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { dynamicLoadPlugin } from "./util/pluginLoader";

describe("globalConfig.ts", () => {
    beforeAll(async () => {
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        await db.docs.bulkPut([mockEnglishContentDto]);
        initLanguage();
    });
    afterAll(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
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

    it("can set the playback progress of a media item", async () => {
        setMediaProgress("mediaId", "contentId", 100);
        expect(getMediaProgress("mediaId", "contentId")).toBe(100);
    });

    it("can return 0 if the playback progress of a media item is not set", async () => {
        expect(getMediaProgress("unknown", "unknown")).toBe(0);
    });

    it("only keeps the playback progress of the last 10 media items", async () => {
        for (let i = 0; i < 20; i++) {
            setMediaProgress(`mediaId${i}`, `contentId${i}`, i);
        }
        expect(getMediaProgress("mediaId0", "contentId0")).toBe(0);
        expect(getMediaProgress("mediaId9", "contentId9")).toBe(0);
        expect(getMediaProgress("mediaId10", "contentId10")).toBe(10);
        expect(getMediaProgress("mediaId19", "contentId19")).toBe(19);
    });

    it("can remove the playback progress of a media item", async () => {
        setMediaProgress("mediaId", "contentId", 100);
        expect(getMediaProgress("mediaId", "contentId")).toBe(100);
        removeMediaProgress("mediaId", "contentId");
        expect(getMediaProgress("mediaId", "contentId")).toBe(0);
    });

    it("can dynamically load a plugin", async () => {
        const _c = await dynamicLoadPlugin("examplePlugin");
        expect(_c.someFunction()).toBe("res");
    });

    it("can initialize the userPreferences", async () => {
        expect(userPreferencesAsRef.value).toEqual({});
    });

    it("can set the userPreferences", async () => {
        userPreferencesAsRef.value = { bookmarks: { "content-post1-eng": { ts: Date.now() } } };
        expect(userPreferencesAsRef.value).toEqual({
            bookmarks: { "content-post1-eng": { ts: Date.now() } },
        });
    });

    it("can remove a bookmark", async () => {
        userPreferencesAsRef.value.bookmarks = {};
        expect(userPreferencesAsRef.value).toEqual({ bookmarks: {} });
    });
});
