import { describe, expect, it } from "vitest";
import { rgbaToThumbHash } from "thumbhash";
import type { ContentDto } from "luminary-shared";
import { thumbHashWash } from "../coverImage";

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
