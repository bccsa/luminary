import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import type { ContentDto } from "luminary-shared";
import type { AnalyticsService } from "@/build-time/contracts/analytics/contract";
import { contentParams, resetAnalyticsForTest, startAnalytics, trackEvent, trackShare } from ".";

function fakeService(): AnalyticsService & Record<string, ReturnType<typeof vi.fn>> {
    return {
        setEnabled: vi.fn(),
        pageView: vi.fn(),
        event: vi.fn(),
        setUserProperty: vi.fn(),
    };
}

function makeRouter() {
    const page = { template: "<div />" };
    return createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: "/", name: "home", component: page },
            { path: "/:slug", name: "content", component: page },
        ],
    });
}

describe("analytics", () => {
    afterEach(() => resetAnalyticsForTest());

    it("drops events before it is started", () => {
        expect(() => trackEvent("share", { method: "x" })).not.toThrow();
    });

    it("follows the reader's consent live", async () => {
        const service = fakeService();
        const accepted = ref(false);

        startAnalytics(service, {
            router: makeRouter(),
            platform: "pwa",
            consented: () => accepted.value,
        });
        expect(service.setEnabled).toHaveBeenLastCalledWith(false);

        accepted.value = true;
        await nextTick();
        expect(service.setEnabled).toHaveBeenLastCalledWith(true);

        accepted.value = false;
        await nextTick();
        expect(service.setEnabled).toHaveBeenLastCalledWith(false);
    });

    it("reports the platform and each navigation by path, never the query", async () => {
        const service = fakeService();
        const router = makeRouter();
        startAnalytics(service, { router, platform: "pwa_installed", consented: () => true });

        await router.push("/an-article?search=secret");

        expect(service.setUserProperty).toHaveBeenCalledWith("platform", "pwa_installed");
        expect(service.pageView).toHaveBeenLastCalledWith({
            path: "/an-article",
            title: "an-article",
        });
    });

    it("skips a sign-in callback", async () => {
        const service = fakeService();
        const router = makeRouter();
        startAnalytics(service, { router, platform: "pwa", consented: () => true });

        await router.push("/?code=abc&state=xyz");

        expect(service.pageView).not.toHaveBeenCalled();
    });

    it("reports the page already open when it starts", async () => {
        const service = fakeService();
        const router = makeRouter();
        await router.push("/opened-first");

        startAnalytics(service, { router, platform: "pwa", consented: () => true });

        expect(service.pageView).toHaveBeenCalledWith({
            path: "/opened-first",
            title: "opened-first",
        });
    });

    it("forwards events once started", () => {
        const service = fakeService();
        startAnalytics(service, { router: makeRouter(), platform: "pwa", consented: () => true });

        trackShare("telegram", { title: "A post", copyright: "© Owner" });

        expect(service.event).toHaveBeenCalledWith("share", {
            method: "telegram",
            content_title: "A post",
            content_copyright: "© Owner",
        });
    });

    it("describes content by its post, language code and rights holder, within GA's length limit", () => {
        startAnalytics(fakeService(), {
            router: makeRouter(),
            platform: "pwa",
            consented: () => false,
            languageCode: (id) => (id === "lang-eng" ? "eng" : undefined),
        });

        const params = contentParams({
            parentId: "post-1",
            language: "lang-eng",
            title: "x".repeat(150),
            author: "An Author",
            copyright: "© Owner",
            parentPostType: "blog",
        } as ContentDto);

        expect(params).toEqual({
            content_id: "post-1",
            content_title: "x".repeat(100),
            content_language: "eng",
            content_author: "An Author",
            content_copyright: "© Owner",
            content_type: "blog",
        });
    });
});
