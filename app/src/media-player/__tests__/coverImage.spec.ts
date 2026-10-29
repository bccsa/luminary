import { describe, expect, it } from "vitest";
import { rgbaToThumbHash } from "thumbhash";
import type { ContentDto } from "luminary-shared";
import { thumbHashTint, thumbHashWash } from "../coverImage";

/** A real ThumbHash of a small two-colour picture, base64 as the API stores it. */
function hashOf(width: number, height: number): string {
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) rgba.set(i % 2 ? [40, 110, 120, 255] : [200, 140, 80, 255], i * 4);
    return btoa(String.fromCharCode(...rgbaToThumbHash(width, height, rgba)));
}

const withCollections = (fileCollections: unknown[]) =>
    ({ parentImageData: { fileCollections } }) as unknown as ContentDto;

describe("thumbHashWash", () => {
    it("decodes the image's ThumbHash into a small picture", () => {
        const wash = thumbHashWash(withCollections([{ aspectRatio: 1, imageFiles: [], thumbHash: hashOf(8, 8) }]));
        expect(wash).toMatch(/^data:image\/png;base64,/);
    });

    it("takes the set nearest square, as the cover does", () => {
        const square = hashOf(8, 8);
        const wide = hashOf(16, 9);
        const content = withCollections([
            { aspectRatio: 1.78, imageFiles: [], thumbHash: wide },
            { aspectRatio: 1.05, imageFiles: [], thumbHash: square },
        ]);
        expect(thumbHashWash(content)).toBe(thumbHashWash(withCollections([{ aspectRatio: 1, imageFiles: [], thumbHash: square }])));
    });

    it("has none for a post without an image, without a ThumbHash, or with one that does not decode", () => {
        expect(thumbHashWash(undefined)).toBeUndefined();
        expect(thumbHashWash(withCollections([{ aspectRatio: 1, imageFiles: [] }]))).toBeUndefined();
        expect(thumbHashWash(withCollections([{ aspectRatio: 1, imageFiles: [], thumbHash: "%%%" }]))).toBeUndefined();
    });
});

describe("thumbHashTint", () => {
    const flat = (rgb: [number, number, number]) => {
        const rgba = new Uint8Array(8 * 8 * 4);
        for (let i = 0; i < 64; i++) rgba.set([...rgb, 255], i * 4);
        return withCollections([{ aspectRatio: 1, imageFiles: [], thumbHash: btoa(String.fromCharCode(...rgbaToThumbHash(8, 8, rgba))) }]);
    };
    const channels = (tint: string | undefined) => tint!.match(/\d+/g)!.map(Number);
    /** WCAG contrast of white text over the colour. */
    const whiteContrast = ([r, g, b]: number[]) => {
        const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 1.05 / (0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) + 0.05);
    };

    it("keeps a dark picture's colour as it is", () => {
        const [r, g, b] = channels(thumbHashTint(flat([30, 60, 70])));
        expect(Math.abs(r - 30)).toBeLessThan(12);
        expect(Math.abs(g - 60)).toBeLessThan(12);
        expect(Math.abs(b - 70)).toBeLessThan(12);
    });

    it("darkens a light picture until white text reads on it, keeping its hue", () => {
        const tint = channels(thumbHashTint(flat([250, 230, 120])));
        expect(whiteContrast(tint)).toBeGreaterThanOrEqual(4.5);
        expect(tint[0]).toBeGreaterThan(tint[2]);
    });

    it("has none for a post without an image, without a ThumbHash, or with one that does not decode", () => {
        expect(thumbHashTint(undefined)).toBeUndefined();
        expect(thumbHashTint(withCollections([{ aspectRatio: 1, imageFiles: [] }]))).toBeUndefined();
        expect(thumbHashTint(withCollections([{ aspectRatio: 1, imageFiles: [], thumbHash: "%%%" }]))).toBeUndefined();
    });
});
