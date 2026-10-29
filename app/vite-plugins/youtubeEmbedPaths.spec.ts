import { describe, expect, it } from "vitest";
import { PAGE_FILES, isPageRequest } from "./youtubeEmbedPaths";

describe("youtubeEmbedPaths", () => {
    it("writes the page as the folder the app frames, and as the .html file older app builds frame", () => {
        expect(PAGE_FILES).toEqual(["youtube-embed/index.html", "youtube-embed.html"]);
    });

    it("serves the page at both addresses in development, and leaves every other request alone", () => {
        expect(isPageRequest("/youtube-embed/?v=dQw4w9WgXcQ&api=1")).toBe(true);
        expect(isPageRequest("/youtube-embed.html?v=dQw4w9WgXcQ&api=1")).toBe(true);
        expect(isPageRequest("/youtube-embed")).toBe(false);
        expect(isPageRequest("/explore")).toBe(false);
        expect(isPageRequest(undefined)).toBe(false);
    });
});
