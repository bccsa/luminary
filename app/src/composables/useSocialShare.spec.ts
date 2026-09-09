import { describe, it, expect, vi, afterEach } from "vitest";
import type { ContentDto, ImageFileCollectionDto } from "luminary-shared";

import {
    buildWhatsAppShareUrl,
    fetchShareImageFile,
    formatShareMessage,
    shareImageUrl,
} from "./useSocialShare";

const contentWith = (fileCollections: ImageFileCollectionDto[]) =>
    ({ parentImageData: { fileCollections } }) as ContentDto;

describe("buildWhatsAppShareUrl", () => {
    // On a phone/tablet, api.whatsapp.com is a supported OS-level Universal Link that hands
    // off to the native app with the text intact.
    it("targets api.whatsapp.com on a coarse pointer (phone/tablet)", () => {
        const url = new URL(buildWhatsAppShareUrl("hello", true));
        expect(url.host).toBe("api.whatsapp.com");
        expect(url.searchParams.get("text")).toBe("hello");
    });

    // On desktop there's no such handoff, so web.whatsapp.com is used directly instead.
    it("targets web.whatsapp.com on a fine pointer (desktop)", () => {
        const url = new URL(buildWhatsAppShareUrl("hello", false));
        expect(url.host).toBe("web.whatsapp.com");
        expect(url.searchParams.get("text")).toBe("hello");
    });
});

describe("formatShareMessage", () => {
    it("marks the copyright line with ©", () => {
        expect(formatShareMessage({ title: "Post 1", copyright: "2026 Luminary" })).toBe(
            "— from “Post 1”\n© 2026 Luminary",
        );
    });

    it("leaves a notice that already carries the symbol alone", () => {
        expect(formatShareMessage({ title: "Post 1", copyright: "© 2026 Luminary" })).toBe(
            "— from “Post 1”\n© 2026 Luminary",
        );
    });
});

describe("shareImageUrl", () => {
    it("picks the best-fitting variant of the collection the article displays", () => {
        const content = contentWith([
            {
                aspectRatio: 1,
                imageFiles: [{ width: 1200, height: 1200, filename: "square.webp" }],
            },
            {
                aspectRatio: 1.78,
                imageFiles: [
                    { width: 480, height: 270, filename: "small.webp" },
                    { width: 1280, height: 720, filename: "large.webp" },
                ],
            },
        ]);

        expect(shareImageUrl(content, "https://cdn.test/bucket")).toBe(
            "https://cdn.test/bucket/large.webp",
        );
    });

    // A phone on mobile data shouldn't pull a print-sized original for a target that
    // re-encodes it anyway.
    it("keeps the fetch small when every variant is oversized", () => {
        const content = contentWith([
            {
                aspectRatio: 1.78,
                imageFiles: [
                    { width: 4000, height: 2250, filename: "huge.webp" },
                    { width: 2400, height: 1350, filename: "big.webp" },
                ],
            },
        ]);

        expect(shareImageUrl(content, "https://cdn.test/bucket/")).toBe(
            "https://cdn.test/bucket/big.webp",
        );
    });

    it("has nothing to share without an image or a bucket", () => {
        expect(shareImageUrl(contentWith([]), "https://cdn.test/bucket")).toBeUndefined();
        expect(
            shareImageUrl(
                contentWith([
                    {
                        aspectRatio: 1.78,
                        imageFiles: [{ width: 800, height: 450, filename: "a.webp" }],
                    },
                ]),
                undefined,
            ),
        ).toBeUndefined();
    });
});

describe("fetchShareImageFile", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("names the file after the image it fetched", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                blob: async () => new Blob(["image-bytes"], { type: "image/webp" }),
            }),
        );

        const file = await fetchShareImageFile("https://cdn.test/bucket/large.webp");

        expect(file?.name).toBe("large.webp");
        expect(file?.type).toBe("image/webp");
    });

    it("gives up quietly when the image can't be fetched", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("blocked by CORS")));
        expect(await fetchShareImageFile("https://cdn.test/bucket/large.webp")).toBeUndefined();

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                blob: async () => new Blob(["<html>"], { type: "text/html" }),
            }),
        );
        expect(await fetchShareImageFile("https://cdn.test/bucket/large.webp")).toBeUndefined();
    });
});
