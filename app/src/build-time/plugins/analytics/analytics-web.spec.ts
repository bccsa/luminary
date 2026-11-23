import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebAnalyticsService } from "./analytics-web";

const ID = "G-TEST123";
const gtagScripts = () => document.head.querySelectorAll('script[src*="googletagmanager.com"]');
const disabled = () => (window as unknown as Record<string, boolean>)[`ga-disable-${ID}`];

describe("WebAnalyticsService", () => {
    beforeEach(() => {
        delete window.dataLayer;
        delete window.gtag;
    });

    afterEach(() => {
        gtagScripts().forEach((s) => s.remove());
        document.cookie = "_ga=; Max-Age=0; path=/";
    });

    it("loads nothing from Google before consent", () => {
        const analytics = new WebAnalyticsService(ID);

        analytics.pageView({ path: "/a", title: "A" });
        analytics.event("content_view", { content_id: "p1" });

        expect(gtagScripts()).toHaveLength(0);
        expect(window.dataLayer).toBeUndefined();
    });

    it("loads gtag once on consent and replays the page the reader is on", () => {
        const analytics = new WebAnalyticsService(ID);
        analytics.pageView({ path: "/a", title: "A" });

        analytics.setEnabled(true);
        analytics.setEnabled(false);
        analytics.setEnabled(true);

        expect(gtagScripts()).toHaveLength(1);
        const pageViews = (window.dataLayer as IArguments[])
            .map((args) => Array.from(args))
            .filter(([command, name]) => command === "event" && name === "page_view");
        expect(pageViews.length).toBeGreaterThanOrEqual(1);
        expect(pageViews[0][2]).toMatchObject({ page_path: "/a", page_title: "A" });
    });

    it("sends events only while enabled", () => {
        const analytics = new WebAnalyticsService(ID);
        analytics.setEnabled(true);
        const events = () =>
            (window.dataLayer as IArguments[])
                .map((args) => Array.from(args))
                .filter(([command, name]) => command === "event" && name === "share");

        analytics.event("share", { method: "x" });
        analytics.setEnabled(false);
        analytics.event("share", { method: "reddit" });

        expect(events()).toHaveLength(1);
        expect(events()[0][2]).toEqual({ method: "x" });
    });

    it("sets the GA kill switch and drops the client-id cookie when consent is withdrawn", () => {
        const analytics = new WebAnalyticsService(ID);
        analytics.setEnabled(true);
        expect(disabled()).toBe(false);
        document.cookie = "_ga=GA1.1.123; path=/";

        analytics.setEnabled(false);

        expect(disabled()).toBe(true);
        expect(document.cookie).not.toContain("_ga=");
    });

    it("does nothing without a measurement ID", () => {
        const analytics = new WebAnalyticsService("");

        analytics.setEnabled(true);
        analytics.pageView({ path: "/a", title: "A" });

        expect(gtagScripts()).toHaveLength(0);
        expect(window.gtag).toBeUndefined();
    });
});
