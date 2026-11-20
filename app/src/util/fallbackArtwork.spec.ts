import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const urls = vi.hoisted(() => ({ list: ["/a.webp", "/b.webp", "/c.webp"] as string[] }));
vi.mock("@/globalConfig", () => ({
    get fallbackImageUrls() {
        return urls.list;
    },
}));

import { fallbackArtworkDataUrl, fallbackImageFor } from "./fallbackArtwork";

describe("fallbackArtwork", () => {
    beforeEach(() => {
        urls.list = ["/a.webp", "/b.webp", "/c.webp"];
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("picks the same stand-in for the same post every time, as the page does", () => {
        const first = fallbackImageFor("post-1");
        expect(first).toBeDefined();
        expect(fallbackImageFor("post-1")).toBe(first);
        expect(urls.list).toContain(first);
    });

    it("has none without a post or without bundled images", async () => {
        expect(fallbackImageFor(undefined)).toBeUndefined();
        urls.list = [];
        expect(fallbackImageFor("post-1")).toBeUndefined();
        expect(await fallbackArtworkDataUrl("post-1")).toBeUndefined();
    });

    it("answers undefined, not an error, when the picture cannot be loaded", async () => {
        class FailingImage {
            onerror?: () => void;
            set src(_: string) {
                queueMicrotask(() => this.onerror?.());
            }
        }
        vi.stubGlobal("Image", FailingImage);
        urls.list = ["/failing.webp"];

        expect(await fallbackArtworkDataUrl("post-2")).toBeUndefined();
    });

    it("stops waiting for a picture that never answers, so playback is not held up", async () => {
        vi.useFakeTimers();
        class SilentImage {
            set src(_: string) {}
        }
        vi.stubGlobal("Image", SilentImage);
        urls.list = ["/silent.webp"];

        const waiting = fallbackArtworkDataUrl("post-4");
        await vi.advanceTimersByTimeAsync(1600);
        expect(await waiting).toBeUndefined();
        vi.useRealTimers();
    });

    it("hands back a small JPEG data URL once the picture has loaded", async () => {
        class LoadingImage {
            naturalWidth = 1920;
            naturalHeight = 1080;
            onload?: () => void;
            set src(_: string) {
                queueMicrotask(() => this.onload?.());
            }
        }
        vi.stubGlobal("Image", LoadingImage);
        urls.list = ["/loading.webp"];
        const drawn: { width: number; height: number }[] = [];
        vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
            if (tag !== "canvas")
                return document.createElementNS("http://www.w3.org/1999/xhtml", tag);
            const canvas = {
                width: 0,
                height: 0,
                getContext: () => ({
                    drawImage: () => drawn.push({ width: canvas.width, height: canvas.height }),
                }),
                toDataURL: () => "data:image/jpeg;base64,AAAA",
            };
            return canvas;
        }) as never);

        expect(await fallbackArtworkDataUrl("post-3")).toBe("data:image/jpeg;base64,AAAA");
        // 1920x1080 scaled so that the long side is 640.
        expect(drawn).toEqual([{ width: 640, height: 360 }]);
    });
});
