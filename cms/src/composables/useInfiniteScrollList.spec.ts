import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref, defineComponent, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { useInfiniteScrollList, useInfiniteScrollLoadMore } from "./useInfiniteScrollList";

vi.mock("@vueuse/core", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@vueuse/core")>();
    return {
        ...actual,
        useIntersectionObserver: vi.fn(),
    };
});

import { useIntersectionObserver, type UseIntersectionObserverReturn } from "@vueuse/core";

function stubIntersectionObserverReturn(): UseIntersectionObserverReturn {
    return {
        isSupported: ref(true),
        isActive: ref(true),
        pause: vi.fn(),
        resume: vi.fn(),
        stop: vi.fn(),
    };
}

/**
 * Capture the observer callback the composable registers, so a test can simulate the
 * sentinel scrolling into view.
 */
function captureObserver() {
    let observerCallback: ((entries: Partial<IntersectionObserverEntry>[]) => void) | undefined;
    vi.mocked(useIntersectionObserver).mockImplementation((_target, callback) => {
        observerCallback = callback as typeof observerCallback;
        return stubIntersectionObserverReturn();
    });
    return {
        intersect: () => observerCallback?.([{ isIntersecting: true }]),
    };
}

beforeEach(() => {
    vi.mocked(useIntersectionObserver).mockReset();
    vi.mocked(useIntersectionObserver).mockReturnValue(stubIntersectionObserverReturn());
});

describe("useInfiniteScrollList", () => {
    it("reveals an initial page-sized window", () => {
        const source = ref([1, 2, 3, 4, 5]);
        let visible: ReturnType<typeof useInfiniteScrollList<number>>["visible"] | undefined;

        const Host = defineComponent({
            setup() {
                ({ visible } = useInfiniteScrollList(source, { pageSize: 2 }));
                return () => null;
            },
        });

        mount(Host);

        expect(visible!.value).toEqual([1, 2]);
    });

    /**
     * Regression for #1797: the window used to grow only when BasePage's `provide`d scroll
     * container fired. An overview page renders BasePage as a *child*, so its `inject` always
     * resolved to the fallback and the container was never observed. The composable must not
     * depend on any ancestor providing anything — mounting it bare has to still page.
     */
    it("grows the window when the sentinel intersects, with no provider in the tree", () => {
        const observer = captureObserver();
        const source = ref([1, 2, 3, 4, 5]);
        let visible: ReturnType<typeof useInfiniteScrollList<number>>["visible"] | undefined;

        const Host = defineComponent({
            setup() {
                ({ visible } = useInfiniteScrollList(source, { pageSize: 2 }));
                return () => null;
            },
        });

        mount(Host); // note: no `global.provide`

        expect(visible!.value).toEqual([1, 2]);
        observer.intersect();
        expect(visible!.value).toEqual([1, 2, 3, 4]);
        observer.intersect();
        expect(visible!.value).toEqual([1, 2, 3, 4, 5]);
    });

    it("observes a sentinel element rather than a scroll container", () => {
        const source = ref([1, 2, 3]);
        let sentinel: ReturnType<typeof useInfiniteScrollList<number>>["sentinel"] | undefined;

        const Host = defineComponent({
            setup() {
                ({ sentinel } = useInfiniteScrollList(source, { pageSize: 2 }));
                return () => null;
            },
        });

        mount(Host);

        // The observed target is the composable's own sentinel ref, not an injected element.
        expect(vi.mocked(useIntersectionObserver).mock.calls[0]![0]).toBe(sentinel);
    });

    it("stops growing once the whole source is visible", () => {
        const observer = captureObserver();
        const source = ref([1, 2, 3]);
        let visible: ReturnType<typeof useInfiniteScrollList<number>>["visible"] | undefined;

        const Host = defineComponent({
            setup() {
                ({ visible } = useInfiniteScrollList(source, { pageSize: 2 }));
                return () => null;
            },
        });

        mount(Host);

        observer.intersect();
        expect(visible!.value).toEqual([1, 2, 3]);
        observer.intersect(); // no-op — hasMore is false
        expect(visible!.value).toEqual([1, 2, 3]);
    });

    it("resets the window when resetWhen deps change", async () => {
        const observer = captureObserver();
        const source = ref(["a", "b", "c", "d"]);
        const filter = ref("x");
        let visible: ReturnType<typeof useInfiniteScrollList<string>>["visible"] | undefined;

        const Host = defineComponent({
            setup() {
                ({ visible } = useInfiniteScrollList(source, {
                    pageSize: 2,
                    resetWhen: [() => filter.value],
                }));
                return () => null;
            },
        });

        mount(Host);

        observer.intersect();
        expect(visible!.value).toEqual(["a", "b", "c", "d"]);

        filter.value = "y";
        await nextTick();
        expect(visible!.value).toEqual(["a", "b"]);
    });

    it("resets the window when the source shrinks", async () => {
        const observer = captureObserver();
        const source = ref(["a", "b", "c", "d"]);
        let visible: ReturnType<typeof useInfiniteScrollList<string>>["visible"] | undefined;

        const Host = defineComponent({
            setup() {
                ({ visible } = useInfiniteScrollList(source, { pageSize: 2 }));
                return () => null;
            },
        });

        mount(Host);

        observer.intersect();
        expect(visible!.value).toEqual(["a", "b", "c", "d"]);

        source.value = ["a"];
        await nextTick();
        expect(visible!.value).toEqual(["a"]);
    });
});

describe("useInfiniteScrollLoadMore", () => {
    it("calls onLoadMore when the sentinel intersects", () => {
        const onLoadMore = vi.fn();
        const observer = captureObserver();

        const Host = defineComponent({
            setup() {
                useInfiniteScrollLoadMore({
                    hasMore: true,
                    isLoading: false,
                    onLoadMore,
                });
                return () => null;
            },
        });

        mount(Host);

        observer.intersect();
        expect(onLoadMore).toHaveBeenCalledOnce();
    });

    it("does not call onLoadMore while loading or when there is nothing more", () => {
        const onLoadMore = vi.fn();
        const observer = captureObserver();

        const hasMore = ref(true);
        const isLoading = ref(true);

        const Host = defineComponent({
            setup() {
                useInfiniteScrollLoadMore({
                    hasMore: () => hasMore.value,
                    isLoading: () => isLoading.value,
                    onLoadMore,
                });
                return () => null;
            },
        });

        mount(Host);

        observer.intersect();
        expect(onLoadMore).not.toHaveBeenCalled();

        isLoading.value = false;
        hasMore.value = false;
        observer.intersect();
        expect(onLoadMore).not.toHaveBeenCalled();
    });
});
