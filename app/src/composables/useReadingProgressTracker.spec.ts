import type { MaybeElement } from "@vueuse/core";
import { defineComponent, nextTick, ref, watchEffect } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
    READING_INTERSECTION_RATIO,
    READING_RESTORE_GUARD_MS,
    applyScrollVelocitySample,
    isBlockEndInViewport,
    isBlockEligibleForDwell,
    isSegmentEligible,
    resolveActiveBlock,
    resolveActiveSegment,
    segmentWordCount,
    splitElementIntoSegments,
    useReadingProgressTracker,
    type ReadingSegment,
    type ViewportBounds,
} from "./useReadingProgressTracker";
import {
    DEFAULT_READING_SPEED_WPM,
    READING_SKIM_WPM_MULTIPLIER,
    computeBlockDwellMs,
    computeMaxScrollWordsPerSec,
    computeScrollVelocityWordsPerSec,
    countWords,
    estimateWordsPerPixel,
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
        options?: { blockEndVisible?: boolean; rect?: { top: number; bottom: number } },
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

class TestIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin: string;
    readonly thresholds: ReadonlyArray<number>;
    callback: IntersectionObserverCallback;
    elements: Element[] = [];

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.callback = callback;
        this.rootMargin = options?.rootMargin ?? "0px";
        const threshold = options?.threshold;
        this.thresholds =
            threshold === undefined ? [0] : Array.isArray(threshold) ? threshold : [threshold];
        observerInstances.push(this as unknown as MockObserver);
    }

    observe(el: Element) {
        this.elements.push(el);
    }

    unobserve(el: Element) {
        this.elements = this.elements.filter((e) => e !== el);
    }

    disconnect() {
        this.elements = [];
    }

    takeRecords(): IntersectionObserverEntry[] {
        return [];
    }

    trigger(
        el: Element,
        isIntersecting: boolean,
        intersectionRatio = READING_INTERSECTION_RATIO,
        options?: { blockEndVisible?: boolean; rect?: { top: number; bottom: number } },
    ) {
        const blockEndVisible = options?.blockEndVisible ?? isIntersecting;
        const rootBounds = makeRect(0, 800);
        const boundingClientRect = options?.rect
            ? makeRect(options.rect.top, options.rect.bottom)
            : blockEndVisible
              ? makeRect(100, 400)
              : makeRect(100, 900);

        this.callback(
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
            this,
        );
    }
}

vi.stubGlobal(
    "IntersectionObserver",
    TestIntersectionObserver as unknown as typeof IntersectionObserver,
);

function mountTracker(
    blockCount = 2,
    scrollable = false,
    averageReadingSpeed = DEFAULT_READING_SPEED_WPM,
    blockTexts?: string[],
    elementHeight: number | number[] = 300,
) {
    mockElementHeight(elementHeight);

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

function mockElementHeight(heightOrHeights: number | number[]) {
    const heights = Array.isArray(heightOrHeights) ? heightOrHeights : null;
    const defaultHeight = Array.isArray(heightOrHeights)
        ? heightOrHeights[0]
        : heightOrHeights;
    const original = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
        this: Element,
    ) {
        if (this.tagName === "P") {
            const paragraphs = Array.from(document.querySelectorAll("p"));
            const index = paragraphs.indexOf(this as HTMLParagraphElement);
            const height =
                heights && index >= 0
                    ? (heights[index] ?? heights[heights.length - 1])
                    : defaultHeight;
            return makeRect(0, height);
        }
        return original.call(this);
    });
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
    Object.defineProperty(scrollEl, "clientHeight", { value: 200, configurable: true });
    const vm = mountResult.wrapper.vm as { scrollContainer: HTMLElement | Window };
    vm.scrollContainer = scrollEl;
    await nextTick();
    mountResult.trackerApi().setup(true);
    await nextTick();
    return mountResult;
}

const BLOCK_ONE_DWELL_MS = computeBlockDwellMs(countWords("Block 1"), DEFAULT_READING_SPEED_WPM);

describe("splitElementIntoSegments", () => {
    it("returns one segment when element height fits in the viewport", () => {
        const el = document.createElement("p");
        el.textContent = "Short paragraph";

        const segments = splitElementIntoSegments(el, 800, 0, 400);
        expect(segments).toHaveLength(1);
        expect(segments[0].segmentCount).toBe(1);
        expect(segments[0].bottomPx - segments[0].topPx).toBe(400);
    });

    it("splits tall elements into viewport-height segments", () => {
        const el = document.createElement("p");
        el.textContent = "Long paragraph with many words";

        const segments = splitElementIntoSegments(el, 200, 0, 1000);
        expect(segments).toHaveLength(5);
        expect(segments[0].segmentIndex).toBe(0);
        expect(segments[4].segmentIndex).toBe(4);
        expect(segments.every((s) => s.segmentCount === 5)).toBe(true);
    });
});

describe("isSegmentEligible", () => {
    const viewport: ViewportBounds = { top: 0, bottom: 800 };

    it("returns true when a middle segment is fully visible", () => {
        const el = document.createElement("p");
        const segments = splitElementIntoSegments(el, 200, 0, 1000);
        const middle = segments[2];

        expect(
            isSegmentEligible(middle, { top: 100 }, viewport),
        ).toBe(true);
    });

    it("returns false when the segment bottom is below the viewport", () => {
        const el = document.createElement("p");
        const segment: ReadingSegment = {
            id: "test-0",
            sourceEl: el,
            segmentIndex: 0,
            segmentCount: 1,
            topPx: 0,
            bottomPx: 1200,
        };

        expect(
            isSegmentEligible(segment, { top: 100 }, viewport),
        ).toBe(false);
    });
});

describe("segmentWordCount", () => {
    it("allocates words proportionally across segments", () => {
        const el = document.createElement("p");
        el.textContent = "one two three four five six seven eight nine ten";
        const segments = splitElementIntoSegments(el, 200, 0, 1000);

        const total = segments.reduce((sum, s) => sum + segmentWordCount(s, 1000), 0);
        expect(total).toBe(countWords(el.textContent));
    });
});

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

describe("resolveActiveBlock", () => {
    it("returns the topmost unread visible block in reading order", () => {
        const blocks = [{ id: 0 }, { id: 1 }, { id: 2 }] as unknown as MaybeElement[];
        const visible = new Set<MaybeElement>([blocks[1], blocks[2]]);
        const confirmed = new Set<MaybeElement>([blocks[0]]);

        expect(resolveActiveBlock(blocks, visible, confirmed)).toBe(blocks[1]);
    });
});

describe("resolveActiveSegment", () => {
    it("returns the topmost unread visible segment in reading order", () => {
        const el = document.createElement("p");
        const segments = splitElementIntoSegments(el, 200, 0, 600);
        const visible = new Set([segments[1].id, segments[2].id]);
        const confirmed = new Set([segments[0].id]);

        expect(resolveActiveSegment(segments, visible, confirmed)).toBe(segments[1]);
    });
});

describe("applyScrollVelocitySample", () => {
    const defaultMaxWordsPerSec = computeMaxScrollWordsPerSec(DEFAULT_READING_SPEED_WPM);
    const wordsPerPixel = estimateWordsPerPixel(100, 500);

    it("detects fast scroll once batched samples exceed the jitter window", () => {
        let state = {
            pendingScrollDeltaY: 0,
            pendingScrollDeltaMs: 0,
            isSkimming: false,
        };

        state = applyScrollVelocitySample(state, 10, 30, wordsPerPixel, defaultMaxWordsPerSec).state;
        expect(state.isSkimming).toBe(false);

        const result = applyScrollVelocitySample(state, 80, 30, wordsPerPixel, defaultMaxWordsPerSec);
        expect(result.isSkimming).toBe(true);
        expect(result.state.isSkimming).toBe(true);
    });

    it("reports when scrolling slows after a fast burst", () => {
        const state = {
            pendingScrollDeltaY: 0,
            pendingScrollDeltaMs: 0,
            isSkimming: true,
        };

        const result = applyScrollVelocitySample(state, 1, 100, wordsPerPixel, defaultMaxWordsPerSec);
        expect(result.isSkimming).toBe(false);
        expect(result.justStoppedSkimming).toBe(true);
        expect(result.state.isSkimming).toBe(false);
    });

    it("uses a WPM-scaled words-per-second cap", () => {
        const slowLanguageCap = computeMaxScrollWordsPerSec(100);
        expect(slowLanguageCap).toBeCloseTo((100 / 60) * READING_SKIM_WPM_MULTIPLIER);

        let state = {
            pendingScrollDeltaY: 0,
            pendingScrollDeltaMs: 0,
            isSkimming: false,
        };
        state = applyScrollVelocitySample(state, 40, 30, wordsPerPixel, slowLanguageCap).state;
        const result = applyScrollVelocitySample(state, 40, 30, wordsPerPixel, slowLanguageCap);
        expect(result.isSkimming).toBe(true);
    });

    it("does not flag skimming when wordsPerPixel is zero", () => {
        const state = {
            pendingScrollDeltaY: 0,
            pendingScrollDeltaMs: 0,
            isSkimming: false,
        };

        const result = applyScrollVelocitySample(state, 5000, 100, 0, defaultMaxWordsPerSec);
        expect(result.isSkimming).toBe(false);
    });

    it("flags the same px/s delta as skim on a dense block but not on a tall sparse block at slow scroll", () => {
        const tallBlockDensity = estimateWordsPerPixel(100, 800);
        const shortBlockDensity = estimateWordsPerPixel(100, 300);
        const deltaY = 50;
        const deltaMs = 1000;

        const tallVelocity = computeScrollVelocityWordsPerSec(deltaY, deltaMs, tallBlockDensity);
        const shortVelocity = computeScrollVelocityWordsPerSec(deltaY, deltaMs, shortBlockDensity);

        expect(tallVelocity).toBeLessThan(defaultMaxWordsPerSec);
        expect(shortVelocity).toBeGreaterThan(defaultMaxWordsPerSec);
    });
});

describe("useReadingProgressTracker", () => {
    beforeEach(() => {
        observerInstances.length = 0;
        localStorage.removeItem("contentProgress");
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
        vi.stubGlobal(
            "ResizeObserver",
            vi.fn().mockImplementation(() => ({
                observe: vi.fn(),
                disconnect: vi.fn(),
                unobserve: vi.fn(),
            })),
        );
    });

    afterEach(() => {
        removeReadingProgress(TEST_CONTENT_ID);
        localStorage.removeItem("contentProgress");
        performanceNowSpy?.mockRestore();
        performanceNowSpy = undefined;
        vi.restoreAllMocks();
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
        observer.trigger(block, true, READING_INTERSECTION_RATIO, {
            rect: { top: 550, bottom: 850 },
        });

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

    it("accumulates dwell only for the active block when multiple blocks are visible", async () => {
        const { wrapper } = mountTracker(2);
        await flushPromises();
        await nextTick();

        const observer = latestObserver();
        observer.trigger(observer.elements[0], true);
        observer.trigger(observer.elements[1], true);

        advanceDwellMs(BLOCK_ONE_DWELL_MS);

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(50);
        wrapper.unmount();
    });

    it("saves progress after velocity drops and dwell completes at low speed", async () => {
        const { wrapper } = await readyScrollableTracker(
            mountTracker(2, true, DEFAULT_READING_SPEED_WPM, undefined, 200),
        );

        const observer = latestObserver();
        const block = observer.elements[0];

        observer.trigger(block, true);
        advanceDwellMs(BLOCK_ONE_DWELL_MS);

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(50);
        wrapper.unmount();
    });

    it("does not auto-restore scroll on mount when saved progress exists", async () => {
        setReadingProgress(TEST_CONTENT_ID, 60);

        const { wrapper } = await readyScrollableTracker(
            mountTracker(2, true, DEFAULT_READING_SPEED_WPM, undefined, 200),
        );
        const scrollEl = wrapper.get('[data-test="scroll-container"]').element as HTMLElement;
        Object.defineProperty(scrollEl, "scrollHeight", { value: 2000, configurable: true });
        Object.defineProperty(scrollEl, "clientHeight", { value: 200, configurable: true });
        const scrollToSpy = vi.fn();
        scrollEl.scrollTo = scrollToSpy;

        advancePerfTime(500);

        expect(scrollToSpy).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it("does not overwrite saved progress during the restore scroll guard window", async () => {
        setReadingProgress(TEST_CONTENT_ID, 60);

        const { wrapper, trackerApi } = await readyScrollableTracker(
            mountTracker(2, true, DEFAULT_READING_SPEED_WPM, undefined, 200),
        );

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
        const { wrapper, trackerApi } = await readyScrollableTracker(
            mountTracker(2, true, DEFAULT_READING_SPEED_WPM, undefined, 200),
        );

        trackerApi().restoreScrollPosition();

        const observer = latestObserver();
        const block = observer.elements[0];

        advancePerfTime(300 + READING_RESTORE_GUARD_MS + 50);
        observer.trigger(block, true);
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

    it("removes local storage entry when progress reaches 100%", async () => {
        const { wrapper } = mountTracker(1);
        await flushPromises();
        await nextTick();

        const observer = latestObserver();
        observer.trigger(observer.elements[0], true);
        advanceDwellMs(BLOCK_ONE_DWELL_MS);

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(0);
        expect(localStorage.getItem("contentProgress")).toBe("[]");
        wrapper.unmount();
    });

    it("tracks progress across segments of a tall paragraph", async () => {
        const longText = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
        const segmentDwell = computeBlockDwellMs(
            Math.round(countWords(longText) / 5),
            DEFAULT_READING_SPEED_WPM,
        );

        const { wrapper, trackerApi } = await readyScrollableTracker(
            mountTracker(1, true, DEFAULT_READING_SPEED_WPM, [longText], 1000),
        );

        await flushPromises();
        await nextTick();

        expect(trackerApi().segments.value.length).toBe(5);

        const observer = latestObserver();
        const block = observer.elements[0];
        observer.trigger(block, true, READING_INTERSECTION_RATIO, {
            rect: { top: 100, bottom: 300 },
        });

        advanceDwellMs(segmentDwell);

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(20);
        wrapper.unmount();
    });
});
