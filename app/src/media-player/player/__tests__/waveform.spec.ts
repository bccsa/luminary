import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import {
    WAVE_BAR_PX,
    WAVE_GAP_PX,
    WAVE_MIN_AMP,
    WAVE_TEXTURE,
    WAVE_TILE_PX,
    clearWaveformCache,
    parseWaveform,
    useWaveform,
    waveBars,
    waveAround,
    waveHeight,
    waveLevel,
    waveTexture,
    waveformLevels,
} from "../ui/waveform";

describe("parseWaveform", () => {
    it("reads a version 2 file", () => {
        expect(parseWaveform({ version: 2, numPeaks: 2, peaks: [0.25, 0.5] })).toEqual({
            peaks: [0.25, 0.5],
            low: 0.25,
            high: 0.5,
        });
    });

    it.each([
        ["nothing", null],
        ["another version", { version: 1, peaks: [0.5] }],
        ["no peaks", { version: 2, peaks: [] }],
        ["peaks that are not numbers", { version: 2, peaks: [0.5, "x"] }],
        ["peaks that are not finite", { version: 2, peaks: [0.5, Number.NaN] }],
    ])("draws nothing for %s", (_, json) => {
        expect(parseWaveform(json)).toBeNull();
    });
});

describe("waveformLevels", () => {
    it("stretches between the quiet floor and the loud ceiling, not the loudest peak", () => {
        const peaks = Array.from({ length: 100 }, (_, i) => i / 100);
        expect(waveformLevels(peaks)).toEqual({ low: 0.1, high: 0.97 });
    });

    it("leaves a silent file flat", () => {
        expect(waveformLevels([0, 0])).toEqual({ low: 0, high: 1 });
    });

    it("falls back to the loudest peak when floor and ceiling meet", () => {
        expect(waveformLevels([0.5, 0.5, 0.5])).toEqual({ low: 0, high: 0.5 });
    });
});

describe("waveHeight", () => {
    const waveform = { peaks: [], low: 0.2, high: 0.8 };

    it("draws the floor as a dot and the ceiling at full height", () => {
        expect(waveHeight(waveform, 0.1)).toBe(WAVE_MIN_AMP);
        expect(waveHeight(waveform, 0.9)).toBe(1);
    });

    it("eases the middle down, so loud stretches stand out from quiet ones", () => {
        const middle = waveHeight(waveform, 0.5);
        expect(middle).toBeGreaterThan(WAVE_MIN_AMP);
        expect(middle).toBeLessThan(0.5);
    });
});

describe("local contrast", () => {
    it("lets a loud stretch show its dips against its own neighbourhood", () => {
        const waveform = { peaks: [], low: 0, high: 1 };
        const around = { low: 0.7, high: 1 };
        expect(waveHeight(waveform, 0.75, around)).toBeLessThan(waveHeight(waveform, 0.75));
    });

    it("measures a bar against the peaks within its radius", () => {
        expect(waveAround([0.1, 0.9, 0.5, 0.3, 0.2], 2, 1)).toEqual({ low: 0.3, high: 0.9 });
    });

    it("gives each bar slot the same texture every time", () => {
        expect(waveTexture(7)).toBe(waveTexture(7));
        expect(waveTexture(7)).not.toBe(waveTexture(8));
    });
});

describe("waveLevel", () => {
    it("reads between neighbouring peaks, so adjacent bars differ", () => {
        const peaks = [0, 1];
        const a = waveLevel(peaks, 0.9, 1.0);
        const b = waveLevel(peaks, 1.0, 1.1);
        expect(a).toBeGreaterThan(0);
        expect(b).toBeGreaterThan(a);
        expect(b).toBeLessThan(1);
    });

    it("blends the mean and the loudest over a stretch wider than a peak", () => {
        expect(waveLevel([0, 0, 0, 1], 0, 4)).toBeCloseTo(0.5 * 0.25 + 0.5 * 1);
    });
});

describe("waveBars", () => {
    const pitch = WAVE_BAR_PX + WAVE_GAP_PX;
    // One second per tile: a bar is `pitch / WAVE_TILE_PX` seconds.
    const barSeconds = pitch / WAVE_TILE_PX;

    it("places bars around the marker, the one at the playhead under it", () => {
        const waveform = { peaks: Array.from({ length: 1000 }, () => 0.5), low: 0, high: 0.5 };
        const bars = waveBars(waveform, {
            time: 50,
            markerX: 100,
            width: 200,
            duration: 100,
            step: 1,
        });
        const under = bars.find((bar) => bar.x <= 100 && bar.x + pitch > 100);
        expect(under).toBeDefined();
        expect(bars[0].x).toBeLessThanOrEqual(0);
        expect(bars[bars.length - 1].x).toBeGreaterThanOrEqual(200 - pitch);
        // Full height, less at most the texture.
        expect(bars.every((bar) => bar.amp >= 1 - WAVE_TEXTURE && bar.amp <= 1)).toBe(true);
        expect(new Set(bars.map((bar) => bar.amp)).size).toBeGreaterThan(1);
    });

    it("keeps each bar in its slot in time as the playhead moves", () => {
        const waveform = { peaks: [0.5], low: 0, high: 0.5 };
        const layout = { markerX: 100, width: 200, duration: 100, step: 1 };
        const before = waveBars(waveform, { ...layout, time: 50 });
        const after = waveBars(waveform, { ...layout, time: 50 + barSeconds / 2 });
        const moved = after.find((bar) => bar.key === before[5].key)!;
        expect(before[5].x - moved.x).toBeCloseTo(pitch / 2);
    });

    it("leaves out bars before the start and past the end", () => {
        const waveform = { peaks: [0.5], low: 0, high: 0.5 };
        const atStart = waveBars(waveform, {
            time: 0,
            markerX: 100,
            width: 200,
            duration: 100,
            step: 1,
        });
        expect(atStart[0].key).toBe(0);
        expect(atStart[0].x).toBe(100);
        const atEnd = waveBars(waveform, {
            time: 100,
            markerX: 100,
            width: 200,
            duration: 100,
            step: 1,
        });
        expect(atEnd[atEnd.length - 1].x).toBeLessThan(100);
    });

    it("draws silence as a dot", () => {
        const waveform = { peaks: [0, 0], low: 0, high: 1 };
        const bars = waveBars(waveform, {
            time: 1,
            markerX: 50,
            width: 100,
            duration: 10,
            step: 1,
        });
        expect(bars.every((bar) => bar.amp === WAVE_MIN_AMP)).toBe(true);
    });

    it("reads a download's shorter timeline at its place in the full item", () => {
        // The full item is loud in its second half only; the download holds just that half.
        const waveform = { peaks: [0, 0, 1, 1], low: 0, high: 1 };
        const layout = { time: 1, markerX: 50, width: 100, duration: 5, step: 1 };
        const later = (bars: { x: number; amp: number }[]) => bars.filter((bar) => bar.x >= 50);
        const mapped = later(
            waveBars(waveform, { ...layout, toFull: (local) => local + 5, fullDuration: 10 }),
        );
        const unmapped = later(waveBars(waveform, { ...layout, fullDuration: 10 }));
        expect(mapped.length).toBeGreaterThan(0);
        expect(mapped.every((bar) => bar.amp > 0.9 * (1 - WAVE_TEXTURE))).toBe(true);
        expect(unmapped.every((bar) => bar.amp === WAVE_MIN_AMP)).toBe(true);
    });

    it("is empty without a duration", () => {
        expect(
            waveBars(
                { peaks: [1], low: 0, high: 1 },
                { time: 0, markerX: 0, width: 100, duration: 0, step: 1 },
            ),
        ).toEqual([]);
    });
});

describe("useWaveform", () => {
    afterEach(() => {
        clearWaveformCache();
        vi.unstubAllGlobals();
    });

    const settle = async () => {
        for (let i = 0; i < 5; i++) await nextTick();
        await new Promise((resolve) => setTimeout(resolve, 0));
    };

    it("loads the file at the url", async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ version: 2, peaks: [0.5] }),
        }));
        vi.stubGlobal("fetch", fetchMock);
        const waveform = useWaveform(ref("https://cdn/a/waveform.json"));
        await settle();
        expect(waveform.value?.peaks).toEqual([0.5]);
        expect(fetchMock).toHaveBeenCalledWith("https://cdn/a/waveform.json");
    });

    it("is null when the file is not there", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: false, json: async () => ({}) })),
        );
        const waveform = useWaveform(ref("https://cdn/b/waveform.json"));
        await settle();
        expect(waveform.value).toBeNull();
    });

    it("is null when the fetch fails", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("offline");
            }),
        );
        const waveform = useWaveform(ref("https://cdn/c/waveform.json"));
        await settle();
        expect(waveform.value).toBeNull();
    });

    it("asks once per url", async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ version: 2, peaks: [0.5] }),
        }));
        vi.stubGlobal("fetch", fetchMock);
        useWaveform(ref("https://cdn/d/waveform.json"));
        useWaveform(ref("https://cdn/d/waveform.json"));
        await settle();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("drops the old waveform when the url changes", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => ({
                ok: url.includes("/e/"),
                json: async () => ({ version: 2, peaks: [0.5] }),
            })),
        );
        const url = ref<string | undefined>("https://cdn/e/waveform.json");
        const waveform = useWaveform(url);
        await settle();
        expect(waveform.value).not.toBeNull();
        url.value = undefined;
        await settle();
        expect(waveform.value).toBeNull();
    });
});
