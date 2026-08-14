import { describe, it, expect } from "vitest";
import { videoSourceFor, hasVideoSource } from "./videoSource";
import type { ContentDto } from "luminary-shared";

const content = (video?: string, hlsUrl?: string) =>
    ({
        video,
        parentMedia: hlsUrl ? { hlsUrl, fileCollections: [] } : undefined,
    }) as unknown as ContentDto;

describe("videoSourceFor", () => {
    it("prefers the encoded collection over a hand-entered URL", () => {
        // The case that matters: a post that once had a link and has since been
        // encoded. The link is a leftover the CMS no longer even lets you edit.
        const source = videoSourceFor(content("https://youtube.com/watch?v=x", "https://cdn/m.m3u8"));

        expect(source).toBe("https://cdn/m.m3u8");
    });

    it("falls back to the typed URL when nothing has been encoded", () => {
        expect(videoSourceFor(content("https://youtube.com/watch?v=x"))).toBe(
            "https://youtube.com/watch?v=x",
        );
    });

    it("uses the encoded collection when there is no typed URL", () => {
        expect(videoSourceFor(content(undefined, "https://cdn/m.m3u8"))).toBe(
            "https://cdn/m.m3u8",
        );
    });

    it("returns undefined when the post has no video at all", () => {
        expect(videoSourceFor(content())).toBeUndefined();
    });

    it("treats an empty string as no video rather than as a source", () => {
        expect(videoSourceFor(content("", "https://cdn/m.m3u8"))).toBe("https://cdn/m.m3u8");
        expect(videoSourceFor(content(""))).toBeUndefined();
    });

    it("tolerates missing content", () => {
        expect(videoSourceFor(undefined)).toBeUndefined();
        expect(videoSourceFor(null)).toBeUndefined();
    });
});

describe("hasVideoSource", () => {
    it("is true for an encoded collection with no typed URL", () => {
        expect(hasVideoSource(content(undefined, "https://cdn/m.m3u8"))).toBe(true);
    });

    it("is true for a typed URL with nothing encoded", () => {
        expect(hasVideoSource(content("https://youtube.com/watch?v=x"))).toBe(true);
    });

    it("is false when neither is set", () => {
        expect(hasVideoSource(content())).toBe(false);
    });
});
