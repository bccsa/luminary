import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApp, defineComponent, h, ref } from "vue";
import { renderToString } from "@vue/server-renderer";
import { useReadingProgressTracker } from "@/composables/useReadingProgressTracker";
import ArticleOutline from "../ArticleOutline.vue";

/**
 * A scroll listener registered during the prerender is never removed: `useEventListener` unbinds
 * on scope dispose, which a server render does not reach. The build has one mock window for the
 * whole run, so each listener pins its component — article text included — until the process
 * exits, and peak memory grows with the number of pages rendered.
 */

vi.mock("@/ssg/isPrerender", () => ({ isPrerender: () => true }));

vi.mock("vue-i18n", () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/common/DropdownMenu.vue", () => ({
    default: defineComponent({
        setup:
            (_p, { slots }) =>
            () =>
                h("div", slots.default?.()),
    }),
}));

function countScrollBinds(render: () => Promise<unknown>) {
    // Both targets: the tracker's container falls back to `window`, while other call sites bind
    // to an element or `document`.
    const spies = [window, document].map((t) => vi.spyOn(t, "addEventListener"));
    return render().then(() =>
        spies.flatMap((spy) => spy.mock.calls.filter(([event]) => event === "scroll")),
    );
}

describe("prerender scroll listeners", () => {
    beforeEach(() => {
        (import.meta.env as { SSR: boolean }).SSR = true;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        (import.meta.env as { SSR: boolean }).SSR = false;
    });

    it("useReadingProgressTracker registers nothing at all", async () => {
        // Broader than scroll: without a viewport none of the tracker's work means anything, so
        // it should leave no listener, observer or frame callback behind on the shared globals.
        const listeners = vi.spyOn(window, "addEventListener");
        const docListeners = vi.spyOn(document, "addEventListener");
        const frames = vi.spyOn(window, "requestAnimationFrame");
        let result: ReturnType<typeof useReadingProgressTracker> | undefined;

        const Host = defineComponent({
            setup() {
                result = useReadingProgressTracker({
                    contentId: ref("content-1"),
                    articleRoot: ref(null),
                    progressRoot: ref(null),
                    scrollContainer: ref(window),
                    enabled: ref(true),
                    averageReadingSpeed: ref(200),
                });
                return () => h("div");
            },
        });

        await renderToString(createApp(Host));

        expect(listeners).not.toHaveBeenCalled();
        expect(docListeners).not.toHaveBeenCalled();
        expect(frames).not.toHaveBeenCalled();
        // Still usable: the page destructures these, so an inert shape has to be a real one.
        expect(result?.readingProgressPercent.value).toBe(0);
        expect(typeof result?.restoreScrollPosition).toBe("function");
    });

    it("ArticleOutline registers none", async () => {
        const Host = defineComponent({
            setup: () => () =>
                h(ArticleOutline, {
                    articleRoot: null,
                    scrollContainer: window,
                    contentId: "content-1",
                    title: "Article Title",
                }),
        });

        const binds = await countScrollBinds(() => renderToString(createApp(Host)));

        expect(binds).toHaveLength(0);
    });
});
