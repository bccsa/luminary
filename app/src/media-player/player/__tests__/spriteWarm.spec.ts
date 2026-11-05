import { describe, expect, it, vi } from "vitest";
import type { ThumbnailSpriteCue } from "@luminary-media-converter/player-web";
import { spriteSheetsByDistance, warmSpriteSheets } from "../ui/spriteWarm";

// The encoder's layout: a frame every 5 s, 25 frames to a sheet.
function thumbnailAt(duration: number) {
    return (t: number): ThumbnailSpriteCue | null => {
        if (t < 0 || t >= duration) return null;
        const frame = Math.floor(t / 5);
        return {
            startTime: frame * 5,
            endTime: Math.min(duration, frame * 5 + 5),
            spriteUrl: `https://x/sprite_${Math.floor(frame / 25)}.webp`,
            x: 0,
            y: 0,
            w: 160,
            h: 90,
        };
    };
}

describe("spriteSheetsByDistance", () => {
    it("lists every sheet once", () => {
        const urls = spriteSheetsByDistance(thumbnailAt(3600), 3600, 0);
        expect(urls).toHaveLength(29);
        expect(new Set(urls).size).toBe(29);
        expect(urls[0]).toBe("https://x/sprite_0.webp");
    });

    it("starts with the sheet under the playhead, then its neighbours", () => {
        const urls = spriteSheetsByDistance(thumbnailAt(3600), 3600, 3485);
        expect(urls.slice(0, 3)).toEqual([
            "https://x/sprite_27.webp",
            "https://x/sprite_28.webp",
            "https://x/sprite_26.webp",
        ]);
    });

    it("lists nothing without a duration or cues", () => {
        expect(spriteSheetsByDistance(thumbnailAt(600), 0, 0)).toEqual([]);
        expect(spriteSheetsByDistance(() => null, 600, 0)).toEqual([]);
    });
});

describe("warmSpriteSheets", () => {
    it("loads every sheet, no more than two at once, carrying on past a failure", async () => {
        let inFlight = 0;
        let peak = 0;
        const loaded: string[] = [];
        const load = vi.fn(async (url: string) => {
            inFlight++;
            peak = Math.max(peak, inFlight);
            await new Promise((r) => setTimeout(r, 1));
            inFlight--;
            if (url === "b") throw new Error("404");
            loaded.push(url);
        });
        await warmSpriteSheets(["a", "b", "c", "d", "e"], load).done;
        expect(load).toHaveBeenCalledTimes(5);
        expect(loaded).toEqual(["a", "c", "d", "e"]);
        expect(peak).toBe(2);
    });

    it("abandons the queue on stop", async () => {
        const load = vi.fn(() => new Promise((r) => setTimeout(r, 1)));
        const warm = warmSpriteSheets(["a", "b", "c", "d", "e"], load);
        warm.stop();
        await warm.done;
        expect(load).toHaveBeenCalledTimes(2);
    });
});
