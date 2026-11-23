import { describe, expect, it } from "vitest";
import { holdsPosition, nowPlayingDownload, selectionOf } from "../downloadPlayback";
import { entryOf } from "./downloadsStub";

describe("downloadPlayback", () => {
    describe("holdsPosition", () => {
        const chapters = [
            { startTime: 0, endTime: 100 },
            { startTime: 100, endTime: 200 },
        ];

        it("holds a position in a stored chapter, the last one up to its end", () => {
            const entry = entryOf("p", chapters, [1]);
            expect(holdsPosition(entry, 50)).toBe(false);
            expect(holdsPosition(entry, 100)).toBe(true);
            expect(holdsPosition(entry, 200)).toBe(true);
        });

        it("holds an item without chapters once its one unit is stored", () => {
            const entry = { ...entryOf("p", [{ startTime: 0, endTime: 1 }], [0]), chapters: [] };
            expect(holdsPosition(entry, 500)).toBe(true);
            expect(holdsPosition({ ...entry, units: [] }, 500)).toBe(false);
        });

        it("does not hold a chapter with no units planned", () => {
            const entry = entryOf("p", chapters, [0, 1]);
            entry.chapters[0].unitIds = [];
            expect(holdsPosition(entry, 50)).toBe(false);
        });
    });

    it("draws the badge as the screen's download tool", () => {
        expect(nowPlayingDownload({ state: "progress", percent: 7 }, "online", true)).toEqual({
            badge: "progress",
            percent: 7,
            source: "online",
            canPlayOnline: true,
        });
        expect(
            nowPlayingDownload({ state: "downloaded", partial: true }, undefined, false),
        ).toEqual({
            badge: "downloaded",
            canPlayOnline: false,
        });
    });

    it("hints the sheet with what plays: no angle or quality for sound alone", () => {
        expect(
            selectionOf({ audioOnly: true, angleId: "a", height: 720, audioLanguage: "en" }),
        ).toEqual({
            kind: "audio",
            audioLanguage: "en",
        });
        expect(selectionOf({ audioOnly: false, angleId: "a", height: 720 })).toEqual({
            kind: "video",
            angleId: "a",
            qualityId: "720",
        });
    });
});
