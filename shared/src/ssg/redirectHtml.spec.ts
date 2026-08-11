import { describe, expect, it } from "vitest";
import { RedirectType } from "../types";
import { redirectFile, redirectHtml, redirectStatus } from "./redirectHtml";

describe("redirectHtml", () => {
    it("writes a meta-refresh redirect with escaped attributes", () => {
        const html = redirectHtml('/target?<x>"&y=1', RedirectType.Permanent);

        expect(html).toContain('content="0;url=/target?&lt;x&gt;&quot;&amp;y=1"');
        expect(html).toContain('rel="canonical" href="/target?&lt;x&gt;&quot;&amp;y=1"');
        expect(html).toContain('location.replace("/target?\\u003cx>\\"&y=1")');
    });

    it("marks a permanent redirect with a 301 status meta tag and a canonical link", () => {
        const html = redirectHtml("/new-slug", RedirectType.Permanent);

        expect(html).toContain('<meta name="x-redirect-status" content="301">');
        expect(html).toContain('rel="canonical" href="/new-slug"');
        expect(html).not.toContain("noindex");
    });

    it("marks a temporary redirect with a 302 status meta tag and noindex instead of canonical", () => {
        const html = redirectHtml("/new-slug", RedirectType.Temporary);

        expect(html).toContain('<meta name="x-redirect-status" content="302">');
        expect(html).toContain('<meta name="robots" content="noindex">');
        expect(html).not.toContain("rel=\"canonical\"");
    });

    it("maps slugs to html files", () => {
        expect(redirectFile("/old-page")).toBe("old-page.html");
    });

    describe("redirectStatus", () => {
        it("maps permanent to 301 and temporary to 302", () => {
            expect(redirectStatus(RedirectType.Permanent)).toBe(301);
            expect(redirectStatus(RedirectType.Temporary)).toBe(302);
        });
    });
});
