import { describe, it, expect } from "vitest";
import { mediaSourceFor, hasMediaSource, resolveMediaSource } from "./mediaSource";
import type { ContentDto } from "luminary-shared";

const content = (video?: string, hlsUrl?: string) =>
    ({
        video,
        parentMedia: hlsUrl ? { hlsUrl } : undefined,
    }) as unknown as ContentDto;

describe("mediaSourceFor", () => {
    it("prefers the encoded collection over a hand-entered URL", () => {
        // The case that matters: a post that once had a link and has since been
        // encoded. The link is a leftover the CMS no longer even lets you edit.
        const source = mediaSourceFor(
            content("https://youtube.com/watch?v=x", "https://cdn/m.m3u8"),
        );

        expect(source).toBe("https://cdn/m.m3u8");
    });

    it("falls back to the typed URL when nothing has been encoded", () => {
        expect(mediaSourceFor(content("https://youtube.com/watch?v=x"))).toBe(
            "https://youtube.com/watch?v=x",
        );
    });

    it("uses the encoded collection when there is no typed URL", () => {
        expect(mediaSourceFor(content(undefined, "https://cdn/m.m3u8"))).toBe("https://cdn/m.m3u8");
    });

    it("returns undefined when the post has no video at all", () => {
        expect(mediaSourceFor(content())).toBeUndefined();
    });

    it("treats an empty string as no video rather than as a source", () => {
        expect(mediaSourceFor(content("", "https://cdn/m.m3u8"))).toBe("https://cdn/m.m3u8");
        expect(mediaSourceFor(content(""))).toBeUndefined();
    });

    it("tolerates missing content", () => {
        expect(mediaSourceFor(undefined)).toBeUndefined();
        expect(mediaSourceFor(null)).toBeUndefined();
    });
});

describe("hasMediaSource", () => {
    it("is true for an encoded collection with no typed URL", () => {
        expect(hasMediaSource(content(undefined, "https://cdn/m.m3u8"))).toBe(true);
    });

    it("is true for a typed URL with nothing encoded", () => {
        expect(hasMediaSource(content("https://youtube.com/watch?v=x"))).toBe(true);
    });

    it("is false when neither is set", () => {
        expect(hasMediaSource(content())).toBe(false);
    });
});

describe("resolveMediaSource", () => {
    const BASE = "https://cdn.example.com/media";
    const REL = "/c5829f07-4ba8-42ed-a449-80d83e6c0b53/master.m3u8";

    it("joins a stored relative URL onto the bucket", () => {
        const content = { parentMedia: { hlsUrl: REL } } as any;
        expect(resolveMediaSource(content, BASE)).toBe(`${BASE}${REL}`);
    });

    it("tolerates a trailing slash on the bucket", () => {
        const content = { parentMedia: { hlsUrl: REL } } as any;
        expect(resolveMediaSource(content, `${BASE}/`)).toBe(`${BASE}${REL}`);
    });

    it("leaves an external URL alone — YouTube has no bucket", () => {
        const yt = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
        const content = { video: yt } as any;
        expect(resolveMediaSource(content, BASE)).toBe(yt);
    });

    it("returns undefined while the bucket is still loading", () => {
        // The honest answer: the URL is not knowable yet, and returning the
        // bare path would have the browser fetch it from the app's own origin.
        const content = { parentMedia: { hlsUrl: REL } } as any;
        expect(resolveMediaSource(content, undefined)).toBeUndefined();
    });

    it("still prefers the encoded collection over a typed-in URL", () => {
        const content = {
            video: "https://example.com/old.m3u8",
            parentMedia: { hlsUrl: REL },
        } as any;
        expect(resolveMediaSource(content, BASE)).toBe(`${BASE}${REL}`);
    });
});
