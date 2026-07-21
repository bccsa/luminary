import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
    setMediaProgress,
    getMediaDuration,
    getMediaProgress,
    removeMediaProgress,
    getReadingProgress,
    contentProgressAsRef,
    removeReadingProgress,
    setReadingProgress,
    syncContentProgressFromStorage,
    watchContentProgressStorage,
} from "@/contentProgress";

describe("contentProgress.ts", () => {
    beforeEach(() => {
        localStorage.clear();
        syncContentProgressFromStorage();
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

    it("can get the media duration", async () => {
        setMediaProgress("mediaId", "contentId", 100, 200);

        const duration = getMediaDuration("mediaId", "contentId");
        expect(duration).toBeDefined();
        expect(duration).toBe(200);
    });

    it("doesn't save the media if the duration is Infinity", async () => {
        setMediaProgress("mediaIdInf", "contentIdInf", 50, Infinity);

        expect(getMediaProgress("mediaIdInf", "contentIdInf")).toBe(0);
        expect(getMediaDuration("mediaIdInf", "contentIdInf")).toBe(0);
    });

    describe("Reading Progress", () => {
        const testContentId = "test-content-id";

        afterEach(() => {
            removeReadingProgress(testContentId);
            localStorage.removeItem("contentProgress");
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
                contentProgressAsRef.value.find((p) => p.contentId === testContentId)?.reading,
            ).toBeUndefined();
        });

        it("bumps recency on an unchanged-progress revisit that is no longer most-recent", () => {
            const otherContentId = "other-content-id";
            setReadingProgress(testContentId, 45);
            setReadingProgress(otherContentId, 10);

            // otherContentId is now most-recent; re-report the same progress for testContentId.
            setReadingProgress(testContentId, 45);

            expect(contentProgressAsRef.value[0].contentId).toBe(testContentId);
            removeReadingProgress(otherContentId);
        });

        it("does not rewrite recency for a same-progress update that is already most-recent", () => {
            setReadingProgress(testContentId, 45);
            const beforeUpdatedAt = contentProgressAsRef.value[0].updatedAt;

            setReadingProgress(testContentId, 45);

            expect(contentProgressAsRef.value[0].updatedAt).toBe(beforeUpdatedAt);
        });

        it("syncContentProgressFromStorage reloads from localStorage", () => {
            localStorage.setItem(
                "contentProgress",
                JSON.stringify([
                    {
                        contentId: testContentId,
                        updatedAt: Date.now(),
                        reading: { progress: 33 },
                    },
                ]),
            );

            syncContentProgressFromStorage();

            expect(getReadingProgress(testContentId)).toBe(33);
            expect(
                contentProgressAsRef.value.find((p) => p.contentId === testContentId)?.reading,
            ).toEqual({ progress: 33 });
        });

        it("watchContentProgressStorage reacts to storage events", () => {
            const stop = watchContentProgressStorage();

            localStorage.setItem(
                "contentProgress",
                JSON.stringify([
                    {
                        contentId: testContentId,
                        updatedAt: Date.now(),
                        reading: { progress: 72 },
                    },
                ]),
            );
            window.dispatchEvent(new StorageEvent("storage", { key: "contentProgress" }));

            expect(getReadingProgress(testContentId)).toBe(72);
            expect(
                contentProgressAsRef.value.find((p) => p.contentId === testContentId)?.reading,
            ).toEqual({ progress: 72 });

            stop();
        });

        it("migrates legacy readingProgress and mediaProgress keys on first load", () => {
            localStorage.setItem(
                "readingProgress",
                JSON.stringify([{ contentId: "legacy-read", progress: 55 }]),
            );
            localStorage.setItem(
                "mediaProgress",
                JSON.stringify([
                    {
                        mediaId: "legacy-media",
                        contentId: "legacy-watch",
                        progress: 90,
                        duration: 180,
                    },
                ]),
            );

            syncContentProgressFromStorage();

            expect(localStorage.getItem("readingProgress")).toBeNull();
            expect(localStorage.getItem("mediaProgress")).toBeNull();
            expect(getReadingProgress("legacy-read")).toBe(55);
            expect(getMediaProgress("legacy-media", "legacy-watch")).toBe(90);
        });
    });
});
