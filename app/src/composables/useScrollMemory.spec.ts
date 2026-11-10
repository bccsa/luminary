import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, KeepAlive, nextTick, ref, type Ref } from "vue";
import { mount } from "@vue/test-utils";
import { localCacheVersion } from "@/globalConfig";
import { markHistoryNavigation, useRevealedCount, useScrollMemory } from "./useScrollMemory";

const routeMock = { fullPath: "/a" };
vi.mock("vue-router", () => ({ useRoute: () => routeMock }));

/** jsdom has no layout, so give the scroller a settable height and a clamped scrollTop. */
function makeScroller(scrollHeight: number, clientHeight = 100) {
    const el = document.createElement("div");
    let top = 0;
    let height = scrollHeight;
    Object.defineProperty(el, "scrollHeight", { get: () => height });
    Object.defineProperty(el, "clientHeight", { value: clientHeight });
    Object.defineProperty(el, "scrollTop", {
        get: () => top,
        set: (v: number) => {
            top = Math.max(0, Math.min(v, height - clientHeight));
        },
    });
    return {
        el,
        setHeight: (h: number) => (height = h),
        scrollTo(v: number) {
            el.scrollTop = v;
            el.dispatchEvent(new Event("scroll"));
        },
    };
}

function mountPage(scroller: HTMLElement, path: string) {
    routeMock.fullPath = path;
    const Page = defineComponent({
        setup() {
            const el = ref<HTMLElement | undefined>(scroller) as Ref<HTMLElement | undefined>;
            useScrollMemory(el);
            return () => h("div");
        },
    });
    return mount(Page);
}

describe("useScrollMemory", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        localCacheVersion.value++; // wipes positions left by a previous test
        markHistoryNavigation(false);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("restores the saved position when a recreated page is reached by back/forward", async () => {
        const first = makeScroller(1000);
        const page = mountPage(first.el, "/a");
        first.scrollTo(400);
        page.unmount();

        markHistoryNavigation(true);
        const second = makeScroller(1000);
        mountPage(second.el, "/a");

        expect(second.el.scrollTop).toBe(400);
    });

    it("starts at the top when the page is reached through a new navigation", () => {
        const first = makeScroller(1000);
        const page = mountPage(first.el, "/a");
        first.scrollTo(400);
        page.unmount();

        const second = makeScroller(1000);
        mountPage(second.el, "/a");

        expect(second.el.scrollTop).toBe(0);
    });

    it("keeps a separate position per route", () => {
        const first = makeScroller(1000);
        const pageA = mountPage(first.el, "/a");
        first.scrollTo(300);
        pageA.unmount();
        const other = makeScroller(1000);
        const pageB = mountPage(other.el, "/b");
        other.scrollTo(700);
        pageB.unmount();

        markHistoryNavigation(true);
        const back = makeScroller(1000);
        mountPage(back.el, "/a");

        expect(back.el.scrollTop).toBe(300);
    });

    it("retries until content that loads late is tall enough", async () => {
        const first = makeScroller(1000);
        const page = mountPage(first.el, "/a");
        first.scrollTo(600);
        page.unmount();

        markHistoryNavigation(true);
        const second = makeScroller(100); // content not loaded yet
        mountPage(second.el, "/a");
        expect(second.el.scrollTop).toBe(0);

        second.setHeight(1000);
        await vi.advanceTimersByTimeAsync(100);

        expect(second.el.scrollTop).toBe(600);
    });

    it("does not overwrite the saved position with the clamped value while restoring", async () => {
        const first = makeScroller(1000);
        const page = mountPage(first.el, "/a");
        first.scrollTo(600);
        page.unmount();

        markHistoryNavigation(true);
        const second = makeScroller(100);
        const restored = mountPage(second.el, "/a");
        second.el.dispatchEvent(new Event("scroll")); // clamped scrollTop is 0
        restored.unmount();

        markHistoryNavigation(true);
        const third = makeScroller(1000);
        mountPage(third.el, "/a");

        expect(third.el.scrollTop).toBe(600);
    });

    it("stops restoring once the user starts scrolling", async () => {
        const first = makeScroller(1000);
        const page = mountPage(first.el, "/a");
        first.scrollTo(600);
        page.unmount();

        markHistoryNavigation(true);
        const second = makeScroller(100);
        mountPage(second.el, "/a");
        second.el.dispatchEvent(new WheelEvent("wheel", { deltaY: 40 }));

        second.setHeight(1000);
        await vi.advanceTimersByTimeAsync(500);

        expect(second.el.scrollTop).toBe(0);
    });

    describe("hiding while restoring", () => {
        const setUp = () => {
            const first = makeScroller(1000);
            const page = mountPage(first.el, "/a");
            first.scrollTo(600);
            page.unmount();
            markHistoryNavigation(true);
            return makeScroller(100); // content not loaded yet
        };

        it("hides the page until the position is reached, then shows it", async () => {
            const second = setUp();
            mountPage(second.el, "/a");
            expect(second.el.style.visibility).toBe("hidden");

            second.setHeight(1000);
            await vi.advanceTimersByTimeAsync(100);

            expect(second.el.scrollTop).toBe(600);
            expect(second.el.style.visibility).toBe("");
        });

        it("never hides a page that is restored straight away", () => {
            const first = makeScroller(1000);
            const page = mountPage(first.el, "/a");
            first.scrollTo(600);
            page.unmount();
            markHistoryNavigation(true);

            const second = makeScroller(1000);
            mountPage(second.el, "/a");

            expect(second.el.scrollTop).toBe(600);
            expect(second.el.style.visibility).toBe("");
        });

        it("shows the page after 200ms even if the position is still out of reach", async () => {
            const second = setUp();
            mountPage(second.el, "/a");

            await vi.advanceTimersByTimeAsync(199);
            expect(second.el.style.visibility).toBe("hidden");
            await vi.advanceTimersByTimeAsync(1);
            expect(second.el.style.visibility).toBe("");

            // The restore carries on behind the visible page.
            second.setHeight(1000);
            await vi.advanceTimersByTimeAsync(100);
            expect(second.el.scrollTop).toBe(600);
        });

        it("shows the page as soon as the reader scrolls", () => {
            const second = setUp();
            mountPage(second.el, "/a");

            second.el.dispatchEvent(new WheelEvent("wheel", { deltaY: 40 }));

            expect(second.el.style.visibility).toBe("");
        });

        it("does not hide a page reached through a new navigation", () => {
            const first = makeScroller(1000);
            const page = mountPage(first.el, "/a");
            first.scrollTo(600);
            page.unmount();
            markHistoryNavigation(false);

            const second = makeScroller(100);
            mountPage(second.el, "/a");

            expect(second.el.style.visibility).toBe("");
        });
    });

    it("keeps restoring through the horizontal wheel inertia of a trackpad swipe", async () => {
        const first = makeScroller(1000);
        const page = mountPage(first.el, "/a");
        first.scrollTo(600);
        page.unmount();

        markHistoryNavigation(true);
        const second = makeScroller(100);
        mountPage(second.el, "/a");
        second.el.dispatchEvent(new WheelEvent("wheel", { deltaX: 60, deltaY: 2 }));

        second.setHeight(1000);
        await vi.advanceTimersByTimeAsync(100);

        expect(second.el.scrollTop).toBe(600);
    });

    it("forgets every position when the local cache is cleared", () => {
        const first = makeScroller(1000);
        const page = mountPage(first.el, "/a");
        first.scrollTo(400);
        page.unmount();

        localCacheVersion.value++;
        markHistoryNavigation(true);
        const second = makeScroller(1000);
        mountPage(second.el, "/a");

        expect(second.el.scrollTop).toBe(0);
    });

    describe("useRevealedCount", () => {
        const leaveAt = (path: string, top: number) => {
            const scroller = makeScroller(1000);
            const page = mountPage(scroller.el, path);
            scroller.scrollTo(top);
            page.unmount();
        };

        it("gives back the saved count only on back/forward", () => {
            leaveAt("/a", 400);
            useRevealedCount().save(24);

            markHistoryNavigation(true);
            expect(useRevealedCount().saved).toBe(24);

            markHistoryNavigation(false);
            expect(useRevealedCount().saved).toBe(0);
        });

        it("keeps a separate count per route", () => {
            leaveAt("/a", 400);
            leaveAt("/b", 300);
            routeMock.fullPath = "/a";
            useRevealedCount().save(24);
            routeMock.fullPath = "/b";
            useRevealedCount().save(16);

            markHistoryNavigation(true);
            routeMock.fullPath = "/a";
            expect(useRevealedCount().saved).toBe(24);
        });

        it("forgets the counts when the local cache is cleared", async () => {
            leaveAt("/a", 400);
            useRevealedCount().save(24);

            localCacheVersion.value++;
            await nextTick();
            markHistoryNavigation(true);

            expect(useRevealedCount().saved).toBe(0);
        });
    });

    describe("inside a KeepAlive", () => {
        it("restores a cached page on reactivation, even without back/forward", async () => {
            const scroller = makeScroller(1000);
            const CachedPage = defineComponent({
                name: "CachedPage",
                setup() {
                    const el = ref<HTMLElement | undefined>(scroller.el);
                    useScrollMemory(el);
                    return () => h("div");
                },
            });
            const show = ref(true);
            routeMock.fullPath = "/a";
            mount(
                defineComponent({
                    render: () =>
                        h(KeepAlive, null, {
                            default: () => (show.value ? h(CachedPage) : h("span")),
                        }),
                }),
            );

            scroller.scrollTo(450);
            show.value = false;
            await nextTick();
            scroller.el.scrollTop = 0; // a detached DOM loses its scroll position
            show.value = true;
            await nextTick();

            expect(scroller.el.scrollTop).toBe(450);
        });
    });
});
