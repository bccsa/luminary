import { describe, expect, it } from "vitest";
import { isYouTubeUrl, extractYouTubeId } from "./youtubeUtils";

describe("isYouTubeUrl", () => {
    it("returns false for empty string", () => {
        expect(isYouTubeUrl("")).toBe(false);
    });

    it("returns false for non-YouTube URLs", () => {
        expect(isYouTubeUrl("https://vimeo.com/123456")).toBe(false);
        expect(isYouTubeUrl("https://google.com")).toBe(false);
        expect(isYouTubeUrl("not a url")).toBe(false);
    });

    it("returns true for standard youtube.com watch URLs", () => {
        expect(isYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
        expect(isYouTubeUrl("http://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    });

    it("returns true for youtu.be short URLs", () => {
        expect(isYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    });

    it("returns true for embed URLs", () => {
        expect(isYouTubeUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(true);
    });

    it("returns true for URLs with extra query params", () => {
        expect(isYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120")).toBe(true);
    });

    it("returns true for URLs without protocol", () => {
        expect(isYouTubeUrl("youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    });
});

describe("extractYouTubeId", () => {
    it("returns null for empty string", () => {
        expect(extractYouTubeId("")).toBeNull();
    });

    it("returns null for non-YouTube URL", () => {
        expect(extractYouTubeId("https://vimeo.com/123456")).toBeNull();
    });

    it("extracts ID from standard watch URL", () => {
        expect(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
            "dQw4w9WgXcQ",
        );
    });

    it("extracts ID from short URL", () => {
        expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("extracts ID from embed URL", () => {
        expect(extractYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("extracts ID from URL with extra query params", () => {
        expect(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120")).toBe(
            "dQw4w9WgXcQ",
        );
    });

    it("returns null for YouTube URL with invalid ID length", () => {
        expect(extractYouTubeId("https://www.youtube.com/watch?v=short")).toBeNull();
    });
});
