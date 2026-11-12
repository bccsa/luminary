import { describe, expect, it } from "vitest";
import { isYouTubeLink, youTubeEmbedUrl, youTubeIdOf } from "./youtube";

describe("youtube", () => {
    it("finds the id in every form a link has been given in", () => {
        const id = "dQw4w9WgXcQ";
        for (const url of [
            `https://www.youtube.com/watch?v=${id}`,
            `https://youtube.com/watch?feature=share&v=${id}`,
            `https://youtu.be/${id}`,
            `https://www.youtube.com/embed/${id}`,
            `https://www.youtube.com/v/${id}`,
        ]) {
            expect(youTubeIdOf(url)).toBe(id);
            expect(isYouTubeLink(url)).toBe(true);
        }
    });

    it("leaves other links and nothing alone", () => {
        expect(youTubeIdOf("https://cdn.example.com/m/master.m3u8")).toBeUndefined();
        expect(isYouTubeLink(undefined)).toBe(false);
        expect(isYouTubeLink("")).toBe(false);
    });

    it("embeds through the privacy-enhanced domain, never youtube.com", () => {
        const url = youTubeEmbedUrl("dQw4w9WgXcQ");
        expect(url.startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toBe(true);
        expect(url).not.toContain("www.youtube.com");
    });
});
