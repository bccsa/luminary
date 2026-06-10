import { defineComponent, nextTick, ref, watchEffect } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
    READING_INTERSECTION_RATIO,
    READING_MAX_SCROLL_VELOCITY_PX_S,
    READING_RESTORE_GUARD_MS,
    applyScrollVelocitySample,
    computeScrollVelocity,
    isBlockEndInViewport,
    isBlockEligibleForDwell,
    useReadingProgressTracker,
} from "./useReadingProgressTracker";
import {
    DEFAULT_READING_SPEED_WPM,
    READING_BASE_MAX_SCROLL_VELOCITY_PX_S,
    READING_IDLE_MS,
    computeBlockDwellMs,
    computeMaxScrollVelocityPxS,
    countWords,
} from "@/util/readingTime";
import { getReadingProgress, removeReadingProgress, setReadingProgress } from "@/globalConfig";

const TEST_CONTENT_ID = "test-reading-content-id";

type MockObserver = {
    callback: IntersectionObserverCallback;
    elements: Element[];
    observe: (el: Element) => void;
    unobserve: (el: Element) => void;
    disconnect: () => void;
    trigger: (
        el: Element,
        isIntersecting: boolean,
        intersectionRatio?: number,
        options?: { blockEndVisible?: boolean },
    ) => void;
};

const observerInstances = vi.hoisted(() => [] as MockObserver[]);

function makeRect(
    top: number,
    bottom: number,
): DOMRectReadOnly {
    return {
        top,
        bottom,
        left: 0,
        right: 400,
        width: 400,
        height: bottom - top,
        x: 0,
        y: top,
        toJSON: () => ({}),
    } as DOMRectReadOnly;
}

vi.stubGlobal(
    "IntersectionObserver",
    vi.fn().mockImplementation((callback: IntersectionObserverCallback) => {
        const instance: MockObserver = {
            callback,
            elements: [],
            observe(el: Element) {
                instance.elements.push(el);
            },
            unobserve(el: Element) {
                instance.elements = instance.elements.filter((e) => e !== el);
            },
            disconnect() {
                instance.elements = [];
            },
            trigger(
                el: Element,
                isIntersecting: boolean,
                intersectionRatio = READING_INTERSECTION_RATIO,
                options?: { blockEndVisible?: boolean },
            ) {
                const blockEndVisible = options?.blockEndVisible ?? isIntersecting;
                const rootBounds = makeRect(0, 800);
                const boundingClientRect = blockEndVisible
                    ? makeRect(100, 400)
                    : makeRect(100, 900);

                callback(
                    [
                        {
                            target: el,
                            isIntersecting,
                            intersectionRatio,
                            boundingClientRect,
                            rootBounds,
                            intersectionRect: boundingClientRect,
                            time: 0,
                        } as IntersectionObserverEntry,
                    ],
                    instance as unknown as IntersectionObserver,
                );
            },
        };
        observerInstances.push(instance);
        return instance;
    }),
);

function mountTracker(
    blockCount = 2,
    scrollable = false,
    averageReadingSpeed = DEFAULT_READING_SPEED_WPM,
    blockTexts?: string[],
) {
    const texts =
        blockTexts ??
        Array.from({ length: blockCount }, (_, i) => `Block ${i + 1}`);

    let trackerApi: ReturnType<typeof useReadingProgressTracker> | undefined;

    const TestComponent = defineComponent({
        setup() {
            const articleRoot = ref<HTMLElement | null>(null);
            const scrollContainerEl = ref<HTMLElement | null>(null);
            const scrollContainer = ref<HTMLElement | Window>(window);
            const contentId = ref(TEST_CONTENT_ID);
            const enabled = ref(true);
            const readingSpeed = ref(averageReadingSpeed);

            watchEffect(() => {
                if (scrollable && scrollContainerEl.value) {
                    scrollContainer.value = scrollContainerEl.value;
                }
            });

            trackerApi = useReadingProgressTracker({
                contentId,
                articleRoot,
                scrollContainer,
                enabled,
                averageReadingSpeed: readingSpeed,
            });

            return { articleRoot, scrollContainerEl, scrollContainer, trackerApi };
        },
        template: scrollable
            ? `
            <div
                ref="scrollContainerEl"
                data-test="scroll-container"
                style="height: 200px; overflow-y: auto;"
            >
                <div ref="articleRoot" style="min-height: 2000px;">
                    ${texts.map((t) => `<p>${t}</p>`).join("")}
                </div>
            </div>
        `
            : `
            <div ref="articleRoot">
                ${texts.map((t) => `<p>${t}</p>`).join("")}
            </div>
        `,
    });

    const wrapper = mount(TestComponent);
    return { wrapper, trackerApi: () => trackerApi! };
}

function latestObserver() {
    return observerInstances[observerInstances.length - 1];
}

let rafTime = 0;
let perfTime = 0;
let rafId = 0;
let performanceNowSpy: MockInstance<[], number> | undefined;
const pendingRafCallbacks = new Map<number, FrameRequestCallback>();

function advancePerfTime(ms: number) {
    vi.advanceTimersByTime(ms);
    perfTime += ms;
}

function flushRafFrame(deltaMs = 16) {
    rafTime += deltaMs;
    const callbacks = [...pendingRafCallbacks.values()];
    pendingRafCallbacks.clear();
    for (const cb of callbacks) {
        cb(rafTime);
    }
}

/** Advance fake time and drive the dwell rAF loop. */
function advanceDwellMs(ms: number, frameMs = 16, { complete = true }: { complete?: boolean } = {}) {
    const dwellFrames = complete ? Math.ceil(ms / frameMs) : Math.floor(ms / frameMs);
    const rafFrames = 1 + dwellFrames;
    for (let i = 0; i < rafFrames; i++) {
        advancePerfTime(frameMs);
        flushRafFrame(frameMs);
    }
}

async function readyScrollableTracker(mountResult: ReturnType<typeof mountTracker>) {
    await flushPromises();
    await nextTick();
    await nextTick();
    const scrollEl = mountResult.wrapper.get('[data-test="scroll-container"]').element as HTMLElement;
    const vm = mountResult.wrapper.vm as { scrollContainer: HTMLElement | Window };
    vm.scrollContainer = scrollEl;
    await nextTick();
    return mountResult;
}

const BLOCK_ONE_DWELL_MS = computeBlockDwellMs(countWords("Block 1"), DEFAULT_READING_SPEED_WPM);

describe("isBlockEndInViewport", () => {
    it("returns true when the block bottom is inside the viewport", () => {
        expect(isBlockEndInViewport(400, { top: 0, bottom: 800 })).toBe(true);
    });

    it("returns false when the block bottom is below the viewport", () => {
        expect(isBlockEndInViewport(900, { top: 0, bottom: 800 })).toBe(false);
    });
});

describe("isBlockEligibleForDwell", () => {
    it("requires intersection ratio, visibility, and block end in viewport", () => {
        const eligible = isBlockEligibleForDwell({
            isIntersecting: true,
            intersectionRatio: READING_INTERSECTION_RATIO,
            boundingClientRect: makeRect(100, 400),
            rootBounds: makeRect(0, 800),
        } as IntersectionObserverEntry);
        expect(eligible).toBe(true);

        const endBelow = isBlockEligibleForDwell({
            isIntersecting: true,
            intersectionRatio: READING_INTERSECTION_RATIO,
            boundingClientRect: makeRect(100, 900),
            rootBounds: makeRect(0, 800),
        } as IntersectionObserverEntry);
        expect(endBelow).toBe(false);
    });
});

describe("computeScrollVelocity", () => {
    it("returns px/s from delta and elapsed time", () => {
        expect(computeScrollVelocity(120, 100)).toBe(1200);
        expect(computeScrollVelocity(-120, 100)).toBe(1200);
    });

    it("returns 0 when sample window is too short (jitter)", () => {
        expect(computeScrollVelocity(100, 49)).toBe(0);
    });
});

describe("applyScrollVelocitySample", () => {
    it("detects fast scroll once batched samples exceed the jitter window", () => {
        let state = {
            pendingScrollDeltaY: 0,
            pendingScrollDeltaMs: 0,
            wasScrollingFast: false,
        };

        state = applyScrollVelocitySample(state, 10, 30).state;
        expect(state.wasScrollingFast).toBe(false);

        const result = applyScrollVelocitySample(state, 80, 30);
        expect(result.isFast).toBe(true);
        expect(result.state.wasScrollingFast).toBe(true);
    });

    it("reports when scrolling slows after a fast burst", () => {
        const state = {
            pendingScrollDeltaY: 0,
            pendingScrollDeltaMs: 0,
            wasScrollingFast: true,
        };

        const result = applyScrollVelocitySample(state, 10, 100);
        expect(result.isFast).toBe(false);
        expect(result.justSlowedDown).toBe(true);
        expect(result.state.wasScrollingFast).toBe(false);
    });

    it("uses a WPM-scaled velocity cap", () => {
        const slowLanguageCap = computeMaxScrollVelocityPxS(100);
        expect(slowLanguageCap).toBe(600);

        let state = {
            pendingScrollDeltaY: 0,
            pendingScrollDeltaMs: 0,
            wasScrollingFast: false,
        };
        state = applyScrollVelocitySample(state, 40, 30, slowLanguageCap).state;
        const result = applyScrollVelocitySample(state, 40, 30, slowLanguageCap);
        expect(result.isFast).toBe(true);
    });
});

describe("useReadingProgressTracker", () => {
    beforeEach(() => {
        observerInstances.length = 0;
        localStorage.removeItem("readingProgress");
        vi.useFakeTimers({ shouldAdvanceTime: true });
        perfTime = 0;
        performanceNowSpy = vi.spyOn(performance, "now").mockImplementation(() => perfTime);
        rafTime = 0;
        rafId = 0;
        pendingRafCallbacks.clear();
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
            const id = ++rafId;
            pendingRafCallbacks.set(id, cb);
            return id;
        });
        vi.stubGlobal("cancelAnimationFrame", (id: number) => {
            pendingRafCallbacks.delete(id);
        });
    });

    afterEach(() => {
        removeReadingProgress(TEST_CONTENT_ID);
        localStorage.removeItem("readingProgress");
        performanceNowSpy?.mockRestore();
        performanceNowSpy = undefined;
        vi.useRealTimers();
    });

    it("does not save progress when a block is visible for less than the dwell time", async () => {
        const { wrapper } = mountTracker();
        await flushPromises();
        await nextTick();

        const observer = latestObserver();
        const block = observer.elements[0];
        observer.trigger(block, true);

        advanceDwellMs(BLOCK_ONE_DWELL_MS - 1, 16, { complete: false });

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(0);
        wrapper.unmount();
    });

    it("does not save when the block end is below the viewport", async () => {
        const { wrapper } = mountTracker();
        await flushPromises();
        await nextTick();

        const observer = latestObserver();
        const block = observer.elements[0];
        observer.trigger(block, true, READING_INTERSECTION_RATIO, { blockEndVisible: false });

        advanceDwellMs(BLOCK_ONE_DWELL_MS);

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(0);
        wrapper.unmount();
    });

    it("saves progress when a block end stays visible for the dwell duration", async () => {
        const { wrapper } = mountTracker(2);
        await flushPromises();
        await nextTick();

        const observer = latestObserver();
        const block = observer.elements[0];
        observer.trigger(block, true);

        advanceDwellMs(BLOCK_ONE_DWELL_MS);

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(50);
        wrapper.unmount();
    });

    it("cancels dwell timer when a block leaves the viewport before dwell completes", async () => {
        const { wrapper } = mountTracker();
        await flushPromises();
        await nextTick();

        const observer = latestObserver();
        const block = observer.elements[0];
        observer.trigger(block, true);

        advanceDwellMs(BLOCK_ONE_DWELL_MS / 2);
        observer.trigger(block, false, 0);
        advanceDwellMs(BLOCK_ONE_DWELL_MS);

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(0);
        wrapper.unmount();
    });

    it("reflects confirmed blocks only in progress percentage", async () => {
        const { wrapper } = mountTracker(4);
        await flushPromises();
        await nextTick();

        const observer = latestObserver();

        observer.trigger(observer.elements[0], true);
        advanceDwellMs(BLOCK_ONE_DWELL_MS);

        observer.trigger(observer.elements[1], true);
        advanceDwellMs(BLOCK_ONE_DWELL_MS);

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(50);
        wrapper.unmount();
    });

    it("uses a longer dwell for wordier blocks at the same reading speed", async () => {
        const longText =
            "This paragraph has many more words than the default test blocks so the dwell timer should take noticeably longer before progress is saved.";
        const longDwell = computeBlockDwellMs(countWords(longText), DEFAULT_READING_SPEED_WPM);
        expect(longDwell).toBeGreaterThan(BLOCK_ONE_DWELL_MS);

        const { wrapper } = mountTracker(2, false, DEFAULT_READING_SPEED_WPM, [longText, "Block 2"]);
        await flushPromises();
        await nextTick();

        const observer = latestObserver();
        observer.trigger(observer.elements[0], true);

        advanceDwellMs(BLOCK_ONE_DWELL_MS);
        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(0);

        advanceDwellMs(longDwell - BLOCK_ONE_DWELL_MS);
        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(50);
        wrapper.unmount();
    });

    it("identifies fast scroll speeds for velocity gating", () => {
        expect(computeScrollVelocity(5000, 100)).toBeGreaterThan(READING_MAX_SCROLL_VELOCITY_PX_S);
        expect(computeScrollVelocity(100, 100)).toBeLessThan(READING_BASE_MAX_SCROLL_VELOCITY_PX_S);
    });

    it("saves progress after velocity drops and dwell completes at low speed", async () => {
        const { wrapper } = await readyScrollableTracker(mountTracker(2, true));

        const observer = latestObserver();
        const block = observer.elements[0];

        observer.trigger(block, true);
        advanceDwellMs(BLOCK_ONE_DWELL_MS);

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(50);
        wrapper.unmount();
    });

    it("auto-restores scroll on mount when saved progress exists", async () => {
        setReadingProgress(TEST_CONTENT_ID, 60);

        const { wrapper } = await readyScrollableTracker(mountTracker(2, true));
        const scrollEl = wrapper.get('[data-test="scroll-container"]').element as HTMLElement;
        Object.defineProperty(scrollEl, "scrollHeight", { value: 2000, configurable: true });
        Object.defineProperty(scrollEl, "clientHeight", { value: 200, configurable: true });
        const scrollToSpy = vi.fn();
        scrollEl.scrollTo = scrollToSpy;

        advancePerfTime(500);

        expect(scrollToSpy).toHaveBeenCalled();
        wrapper.unmount();
    });

    it("does not overwrite saved progress during the restore scroll guard window", async () => {
        setReadingProgress(TEST_CONTENT_ID, 60);

        const { wrapper, trackerApi } = await readyScrollableTracker(mountTracker(2, true));

        trackerApi().restoreScrollPosition();

        const observer = latestObserver();
        const block = observer.elements[0];

        advancePerfTime(350);
        observer.trigger(block, true);
        advanceDwellMs(BLOCK_ONE_DWELL_MS);

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(60);
        wrapper.unmount();
    });

    it("does not decrease saved progress when tracker re-initializes", async () => {
        setReadingProgress(TEST_CONTENT_ID, 50);

        const { wrapper } = mountTracker(4);
        await flushPromises();
        await nextTick();

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(50);
        wrapper.unmount();
    });

    it("seeds confirmed blocks using the same rounding as saved progress", async () => {
        setReadingProgress(TEST_CONTENT_ID, 33);

        const { wrapper } = mountTracker(3);
        await flushPromises();
        await nextTick();

        const observer = latestObserver();
        observer.trigger(observer.elements[1], true);
        advanceDwellMs(BLOCK_ONE_DWELL_MS);

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(67);
        wrapper.unmount();
    });

    it("allows dwell to start after the restore guard window ends", async () => {
        const { wrapper, trackerApi } = await readyScrollableTracker(mountTracker(2, true));

        trackerApi().restoreScrollPosition();

        const observer = latestObserver();
        const block = observer.elements[0];

        advancePerfTime(300 + READING_RESTORE_GUARD_MS + 50);
        observer.trigger(block, true);
        advanceDwellMs(BLOCK_ONE_DWELL_MS);

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(50);
        wrapper.unmount();
    });

    it("pauses dwell accumulation after idle timeout", async () => {
        const { wrapper } = mountTracker();
        await flushPromises();
        await nextTick();

        const observer = latestObserver();
        observer.trigger(observer.elements[0], true);

        advanceDwellMs(200, 16, { complete: false });
        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(0);

        advancePerfTime(READING_IDLE_MS + 2000);
        flushRafFrame(16);
        advanceDwellMs(BLOCK_ONE_DWELL_MS);

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(0);

        window.dispatchEvent(new Event("scroll"));
        advanceDwellMs(BLOCK_ONE_DWELL_MS);
        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(50);
        wrapper.unmount();
    });

    it("tracks progress without scrolling when blocks are visible on screen", async () => {
        const { wrapper } = mountTracker(3);
        await flushPromises();
        await nextTick();

        const observer = latestObserver();
        observer.trigger(observer.elements[0], true);
        advanceDwellMs(BLOCK_ONE_DWELL_MS);
        observer.trigger(observer.elements[1], true);
        advanceDwellMs(BLOCK_ONE_DWELL_MS);

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(67);
        wrapper.unmount();
    });
});
