import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
    appLanguageAsRef,
    appLanguageIdsAsRef,
    initLanguage,
    setMediaProgress,
    getMediaDuration,
    getMediaProgress,
    removeMediaProgress,
    getReadingProgress,
    readingProgressAsRef,
    removeReadingProgress,
    setReadingProgress,
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
            expect(appLanguageIdsAsRef.value).toContain(mockLanguageDtoEng._id);
        });
    });

    it("can return the preferred language document", async () => {
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        await waitForExpect(async () => {
            expect(appLanguageAsRef.value).toEqual(mockLanguageDtoEng);
        });
    });

    it("can set the playback progress of a media item", async () => {
        setMediaProgress("mediaId", "contentId", 100, 200);
        expect(getMediaProgress("mediaId", "contentId")).toBe(100);
    });

    it("can return 0 if the playback progress of a media item is not set", async () => {
        expect(getMediaProgress("unknown", "unknown")).toBe(0);
    });

    it("only keeps the playback progress of the last 10 media items", async () => {
        for (let i = 0; i < 20; i++) {
            setMediaProgress(`mediaId${i}`, `contentId${i}`, i, i * 10);
        }
        expect(getMediaProgress("mediaId0", "contentId0")).toBe(0);
        expect(getMediaProgress("mediaId9", "contentId9")).toBe(0);
        expect(getMediaProgress("mediaId10", "contentId10")).toBe(10);
        expect(getMediaProgress("mediaId19", "contentId19")).toBe(19);
    });

    it("can remove the playback progress of a media item", async () => {
        setMediaProgress("mediaId", "contentId", 100, 200);
        expect(getMediaProgress("mediaId", "contentId")).toBe(100);
        removeMediaProgress("mediaId", "contentId");
        expect(getMediaProgress("mediaId", "contentId")).toBe(0);
    });

    it("can dynamically load a plugin", async () => {
        const _c = await dynamicLoadPlugin("examplePlugin");
        expect(_c.someFunction()).toBe("res");
    });

    it("can get the media duration", async () => {
        setMediaProgress("mediaId", "contentId", 100, 200);

        const duration = getMediaDuration("mediaId", "contentId");
        expect(duration).toBeDefined();
        expect(duration).toBe(200);
    });

    describe("Reading Progress", () => {
        const testContentId = "test-content-id";

        afterEach(() => {
            removeReadingProgress(testContentId);
            localStorage.removeItem("readingProgress");
        });

        it("sets and gets reading progress correctly", () => {
            setReadingProgress(testContentId, 45);
            expect(getReadingProgress(testContentId)).toBe(45);
        });

        it("clamps progress to 100 max", () => {
            setReadingProgress(testContentId, 120);
            expect(getReadingProgress(testContentId)).toBe(100);
        });

        it("clamps progress to 0 min", () => {
            setReadingProgress(testContentId, -10);
            expect(getReadingProgress(testContentId)).toBe(0);
        });

        it("removes reading progress correctly", () => {
            setReadingProgress(testContentId, 50);
            expect(getReadingProgress(testContentId)).toBe(50);

            removeReadingProgress(testContentId);
            expect(getReadingProgress(testContentId)).toBe(0);
            expect(
                readingProgressAsRef.value.find((p) => p.contentId === testContentId),
            ).toBeUndefined();
        });
    });
});
