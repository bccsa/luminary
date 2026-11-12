import { describe, expect, it } from "vitest";
import { rgbaToThumbHash } from "thumbhash";
import type { ContentDto } from "luminary-shared";
import {
    coverImageSrcset,
    coverImageUrl,
    imageFileUrls,
    posterImageUrl,
    thumbHashOf,
    thumbHashTint,
} from "../coverImage";

/** A real ThumbHash of a small two-colour picture, base64 as the API stores it. */
function hashOf(width: number, height: number): string {
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++)
        rgba.set(i % 2 ? [40, 110, 120, 255] : [200, 140, 80, 255], i * 4);
    return btoa(String.fromCharCode(...rgbaToThumbHash(width, height, rgba)));
}

const withCollections = (fileCollections: unknown[]) =>
    ({ parentImageData: { fileCollections } }) as unknown as ContentDto;

describe("posterImageUrl", () => {
    const content = withCollections([
        { aspectRatio: 1, imageFiles: [{ width: 640, filename: "square-640.webp" }] },
        {
            aspectRatio: 1.78,
            imageFiles: [
                { width: 480, filename: "wide-480.webp" },
                { width: 1000, filename: "wide-1000.webp" },
            ],
        },
    ]);

    it("takes the wide set at the file nearest 960 px, where the cover takes the square one", () => {
        expect(posterImageUrl(content, "https://cdn.example.com/b/")).toBe(
            "https://cdn.example.com/b/wide-1000.webp",
        );
        expect(coverImageUrl(content, "https://cdn.example.com/b")).toBe(
            "https://cdn.example.com/b/square-640.webp",
        );
    });

    it("has none until the bucket's address is known", () => {
        expect(posterImageUrl(content, undefined)).toBeUndefined();
    });
});

describe("thumbHashOf", () => {
    it("gives the image's ThumbHash as stored, to be drawn as the wash", () => {
        const hash = hashOf(8, 8);
        expect(
            thumbHashOf(withCollections([{ aspectRatio: 1, imageFiles: [], thumbHash: hash }])),
        ).toBe(hash);
    });

    it("takes the set nearest square, as the cover does", () => {
        const square = hashOf(8, 8);
        const content = withCollections([
            { aspectRatio: 1.78, imageFiles: [], thumbHash: hashOf(16, 9) },
            { aspectRatio: 1.05, imageFiles: [], thumbHash: square },
        ]);
        expect(thumbHashOf(content)).toBe(square);
    });

    it("has none for a post without an image, without a ThumbHash, or with one that does not decode", () => {
        expect(thumbHashOf(undefined)).toBeUndefined();
        expect(thumbHashOf(withCollections([{ aspectRatio: 1, imageFiles: [] }]))).toBeUndefined();
        expect(
            thumbHashOf(withCollections([{ aspectRatio: 1, imageFiles: [], thumbHash: "%%%" }])),
        ).toBeUndefined();
        expect(
            thumbHashOf(withCollections([{ aspectRatio: 1, imageFiles: [], thumbHash: "AAE=" }])),
        ).toBeUndefined();
    });
});

describe("thumbHashTint", () => {
    const flat = (rgb: [number, number, number]) => {
        const rgba = new Uint8Array(8 * 8 * 4);
        for (let i = 0; i < 64; i++) rgba.set([...rgb, 255], i * 4);
        return withCollections([
            {
                aspectRatio: 1,
                imageFiles: [],
                thumbHash: btoa(String.fromCharCode(...rgbaToThumbHash(8, 8, rgba))),
            },
        ]);
    };
    const channels = (tint: string | undefined) => tint!.match(/\d+/g)!.map(Number);

    it("keeps a dark picture's colour as it is", () => {
        const [r, g, b] = channels(thumbHashTint(flat([30, 60, 70])));
        expect(Math.abs(r - 30)).toBeLessThan(12);
        expect(Math.abs(g - 60)).toBeLessThan(12);
        expect(Math.abs(b - 70)).toBeLessThan(12);
    });

    it("darkens a light picture until white text reads on it, keeping its hue", () => {
        const [r, g, b] = channels(thumbHashTint(flat([250, 230, 120])));
        const lin = (v: number) =>
            (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        expect(
            1.05 / (0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) + 0.05),
        ).toBeGreaterThanOrEqual(4.5);
        expect(r).toBeGreaterThan(b);
    });

    it("has none for a post without an image, without a ThumbHash, or with one that does not decode", () => {
        expect(thumbHashTint(undefined)).toBeUndefined();
        expect(
            thumbHashTint(withCollections([{ aspectRatio: 1, imageFiles: [] }])),
        ).toBeUndefined();
        expect(
            thumbHashTint(withCollections([{ aspectRatio: 1, imageFiles: [], thumbHash: "%%%" }])),
        ).toBeUndefined();
    });
});

describe("offline-friendly addresses", () => {
    const content = withCollections([
        {
            aspectRatio: 1,
            imageFiles: [
                { width: 640, filename: "square-640.webp" },
                { width: 180, filename: "square-180.webp" },
            ],
        },
        { aspectRatio: 1.78, imageFiles: [{ width: 480, filename: "wide-480.webp" }] },
    ]);
    const base = "https://cdn.example.com/b";

    it("offers the cover's every width, so the browser can settle on one it holds", () => {
        expect(coverImageSrcset(content, base)).toBe(
            `${base}/square-180.webp 180w, ${base}/square-640.webp 640w`,
        );
    });

    it("lists every file, wide enough ones smallest first, then the small ones largest first", () => {
        expect(imageFileUrls(content, base, 480)).toEqual([
            `${base}/wide-480.webp`,
            `${base}/square-640.webp`,
            `${base}/square-180.webp`,
        ]);
    });
});
