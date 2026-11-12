import { describe, expect, it } from "vitest";
import type { ThumbnailSpriteCue } from "@luminary-media-converter/player-web";
import { SpriteWarmer, spriteSheetsByDistance, spriteWarmLimit } from "../ui/spriteWarm";

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

    it("lists nothing for a live stream, whose duration is Infinity", () => {
        expect(spriteSheetsByDistance(() => null, Infinity, 0)).toEqual([]);
    });
});

describe("spriteWarmLimit", () => {
    const playback = {
        started: true,
        stalled: false,
        currentTime: 100,
        bufferedEnd: 100,
        duration: 3600,
    };

    it("fetches nothing before playback starts, while it stalls, or with little buffer", () => {
        expect(spriteWarmLimit({ ...playback, started: false, bufferedEnd: 200 })).toBe(0);
        expect(spriteWarmLimit({ ...playback, stalled: true, bufferedEnd: 200 })).toBe(0);
        expect(spriteWarmLimit({ ...playback, bufferedEnd: 109 })).toBe(0);
    });

    it("fetches the window around the playhead with some buffer, and all with plenty", () => {
        expect(spriteWarmLimit({ ...playback, bufferedEnd: 110 })).toBe(7);
        expect(spriteWarmLimit({ ...playback, bufferedEnd: 130 })).toBe(Infinity);
        expect(spriteWarmLimit({ ...playback, bufferedEnd: 3600 - 0.2, currentTime: 3595 })).toBe(
            Infinity,
        );
    });
});

describe("SpriteWarmer", () => {
    function harness() {
        const started: string[] = [];
        const aborted: string[] = [];
        const pending = new Map<string, { resolve: () => void; reject: () => void }>();
        const load = (url: string, signal: AbortSignal) =>
            new Promise<void>((resolve, reject) => {
                started.push(url);
                pending.set(url, { resolve, reject });
                signal.addEventListener("abort", () => {
                    aborted.push(url);
                    reject(new Error("aborted"));
                });
            });
        const settle = async (url: string, ok = true) => {
            const p = pending.get(url)!;
            if (ok) p.resolve();
            else p.reject();
            await new Promise((r) => setTimeout(r));
        };
        return { warmer: new SpriteWarmer(load), started, aborted, settle };
    }

    it("fetches nothing until allowed, then no more than two at once, nearest first", async () => {
        const { warmer, started, settle } = harness();
        warmer.setSheets(["a", "b", "c", "d"]);
        expect(started).toEqual([]);

        warmer.setLimit(Infinity);
        expect(started).toEqual(["a", "b"]);
        await settle("a");
        expect(started).toEqual(["a", "b", "c"]);
        await settle("b", false);
        await settle("c");
        expect(started).toEqual(["a", "b", "c", "d"]);
    });

    it("goes no further down the order than its limit, and pauses when the limit drops", async () => {
        const { warmer, started, settle } = harness();
        warmer.setSheets(["a", "b", "c", "d"]);
        warmer.setLimit(1);
        expect(started).toEqual(["a"]);
        await settle("a");
        expect(started).toEqual(["a"]);

        warmer.setLimit(3);
        warmer.setLimit(0);
        await settle("b");
        await settle("c");
        expect(started).toEqual(["a", "b", "c"]);
    });

    it("re-centres on a new order without fetching a sheet twice", async () => {
        const { warmer, started, settle } = harness();
        warmer.setSheets(["a", "b", "c"]);
        warmer.setLimit(1);
        await settle("a");
        warmer.setSheets(["c", "a", "b"]);
        warmer.setLimit(2);
        expect(started).toEqual(["a", "c"]);
    });

    it("aborts what is loading on stop, and fetches nothing more", async () => {
        const { warmer, started, aborted } = harness();
        warmer.setSheets(["a", "b", "c"]);
        warmer.setLimit(Infinity);
        warmer.stop();
        expect(aborted).toEqual(["a", "b"]);
        warmer.setLimit(Infinity);
        await new Promise((r) => setTimeout(r));
        expect(started).toEqual(["a", "b"]);
    });
});
