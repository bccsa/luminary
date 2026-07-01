import { describe, expect, it } from "vitest";
import { redirectFile, redirectHtml } from "./redirectHtml";

describe("redirectHtml", () => {
    it("writes a meta-refresh redirect with escaped attributes", () => {
        const html = redirectHtml('/target?<x>"&y=1');

        expect(html).toContain('content="0;url=/target?&lt;x&gt;&quot;&amp;y=1"');
        expect(html).toContain('rel="canonical" href="/target?&lt;x&gt;&quot;&amp;y=1"');
        expect(html).toContain('location.replace("/target?\\u003cx>\\"&y=1")');
    });

    it("maps slugs to html files", () => {
        expect(redirectFile("/old-page")).toBe("old-page.html");
    });
});
