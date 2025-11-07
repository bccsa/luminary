import { describe, it, expect } from "vitest";
import { isYouTubeUrl, extractYouTubeId, convertToVideoJSYouTubeUrl } from "./youtubeUtils";

describe("YouTube Utilities", () => {
    const testVideoId = "dQw4w9WgXcQ";
    const validUrls = [
        `https://www.youtube.com/watch?v=${testVideoId}`,
        `https://youtube.com/watch?v=${testVideoId}`,
        `https://youtu.be/${testVideoId}`,
        `https://www.youtube.com/embed/${testVideoId}`,
        `https://youtube.com/v/${testVideoId}`,
        `www.youtube.com/watch?v=${testVideoId}`,
        `youtube.com/watch?v=${testVideoId}`,
        `youtu.be/${testVideoId}`,
    ];

    const invalidUrls = [
        "https://vimeo.com/123456789",
        "https://example.com/video.mp4",
        "not-a-url",
        "",
        "https://youtube.com/watch?v=invalid_id_too_short",
    ];

    describe("isYouTubeUrl", () => {
        it("should correctly identify valid YouTube URLs", () => {
            validUrls.forEach((url) => {
                expect(isYouTubeUrl(url)).toBe(true);
            });
        });

        it("should correctly reject invalid URLs", () => {
            invalidUrls.forEach((url) => {
                expect(isYouTubeUrl(url)).toBe(false);
            });
        });

        it("should handle edge cases", () => {
            expect(isYouTubeUrl("")).toBe(false);
            expect(isYouTubeUrl("null")).toBe(false);
        });
    });

    describe("extractYouTubeId", () => {
        it("should extract video ID from valid YouTube URLs", () => {
            validUrls.forEach((url) => {
                expect(extractYouTubeId(url)).toBe(testVideoId);
            });
        });

        it("should return null for invalid URLs", () => {
            invalidUrls.forEach((url) => {
                expect(extractYouTubeId(url)).toBe(null);
            });
        });

        it("should handle URLs with additional parameters", () => {
            expect(
                extractYouTubeId(
                    `https://www.youtube.com/watch?v=${testVideoId}&t=30s&list=PLz123`,
                ),
            ).toBe(testVideoId);
        });
    });

    describe("convertToVideoJSYouTubeUrl", () => {
        it("should convert various YouTube URL formats to VideoJS format", () => {
            const expectedUrl = `https://www.youtube.com/watch?v=${testVideoId}`;

            validUrls.forEach((url) => {
                expect(convertToVideoJSYouTubeUrl(url)).toBe(expectedUrl);
            });
        });

        it("should return original URL if not a YouTube URL", () => {
            const nonYouTubeUrl = "https://example.com/video.mp4";
            expect(convertToVideoJSYouTubeUrl(nonYouTubeUrl)).toBe(nonYouTubeUrl);
        });
    });
});
