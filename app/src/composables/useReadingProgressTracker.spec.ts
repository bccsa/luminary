import { defineComponent, nextTick, ref, watchEffect } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    READING_INTERSECTION_RATIO,
    READING_MAX_SCROLL_VELOCITY_PX_S,
    READING_RESTORE_GUARD_MS,
    applyScrollVelocitySample,
    computeScrollVelocity,
    useReadingProgressTracker,
} from "./useReadingProgressTracker";
import {
    DEFAULT_READING_SPEED_WPM,
    computeBlockDwellMs,
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
    trigger: (el: Element, isIntersecting: boolean, intersectionRatio?: number) => void;
};

const observerInstances = vi.hoisted(() => [] as MockObserver[]);

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
            trigger(el: Element, isIntersecting: boolean, intersectionRatio = READING_INTERSECTION_RATIO) {
                callback(
                    [
                        {
                            target: el,
                            isIntersecting,
                            intersectionRatio,
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

            useReadingProgressTracker({
                contentId,
                articleRoot,
                scrollContainer,
                enabled,
                averageReadingSpeed: readingSpeed,
            });

            return { articleRoot, scrollContainerEl, scrollContainer };
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

    return mount(TestComponent);
}

function latestObserver() {
    return observerInstances[observerInstances.length - 1];
}

let rafTime = 0;
let rafId = 0;
const pendingRafCallbacks = new Map<number, FrameRequestCallback>();

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
        vi.advanceTimersByTime(frameMs);
        flushRafFrame(frameMs);
    }
}

async function readyScrollableTracker(wrapper: ReturnType<typeof mountTracker>) {
    await flushPromises();
    await nextTick();
    await nextTick();
    const scrollEl = wrapper.get('[data-test="scroll-container"]').element as HTMLElement;
    const vm = wrapper.vm as { scrollContainer: HTMLElement | Window };
    vm.scrollContainer = scrollEl;
    await nextTick();
    return wrapper;
}


const BLOCK_ONE_DWELL_MS = computeBlockDwellMs(countWords("Block 1"), DEFAULT_READING_SPEED_WPM);

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

        state = applyScrollVelocitySample(state, 80, 30).state;
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
});

describe("useReadingProgressTracker", () => {
    beforeEach(() => {
        observerInstances.length = 0;
        localStorage.removeItem("readingProgress");
        vi.useFakeTimers({ shouldAdvanceTime: true });
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
        vi.useRealTimers();
    });

    it("does not save progress when a block is visible for less than the dwell time", async () => {
        const wrapper = mountTracker();
        await flushPromises();
        await nextTick();

        const observer = latestObserver();
        const block = observer.elements[0];
        observer.trigger(block, true);

        advanceDwellMs(BLOCK_ONE_DWELL_MS - 1, 16, { complete: false });

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(0);
        wrapper.unmount();
    });

    it("saves progress when a block stays visible for the dwell duration", async () => {
        const wrapper = mountTracker(2);
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
        const wrapper = mountTracker();
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
        const wrapper = mountTracker(4);
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

        const wrapper = mountTracker(2, false, DEFAULT_READING_SPEED_WPM, [longText, "Block 2"]);
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
        expect(computeScrollVelocity(100, 100)).toBeLessThan(READING_MAX_SCROLL_VELOCITY_PX_S);
    });

    it("saves progress after velocity drops and dwell completes at low speed", async () => {
        const wrapper = await readyScrollableTracker(mountTracker(2, true));

        const observer = latestObserver();
        const block = observer.elements[0];

        observer.trigger(block, true);
        advanceDwellMs(BLOCK_ONE_DWELL_MS);

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(50);
        wrapper.unmount();
    });

    it("does not overwrite saved progress during the restore scroll guard window", async () => {
        setReadingProgress(TEST_CONTENT_ID, 60);

        const wrapper = await readyScrollableTracker(mountTracker(2, true));

        const observer = latestObserver();
        const block = observer.elements[0];

        vi.advanceTimersByTime(350);
        observer.trigger(block, true);
        advanceDwellMs(BLOCK_ONE_DWELL_MS);

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(60);
        wrapper.unmount();
    });

    it("does not decrease saved progress when tracker re-initializes", async () => {
        setReadingProgress(TEST_CONTENT_ID, 50);

        const wrapper = mountTracker(4);
        await flushPromises();
        await nextTick();

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(50);
        wrapper.unmount();
    });

    it("seeds confirmed blocks using the same rounding as saved progress", async () => {
        setReadingProgress(TEST_CONTENT_ID, 33);

        const wrapper = mountTracker(3);
        await flushPromises();
        await nextTick();

        const observer = latestObserver();
        observer.trigger(observer.elements[1], true);
        advanceDwellMs(BLOCK_ONE_DWELL_MS);

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(67);
        wrapper.unmount();
    });

    it("allows dwell to start after the restore guard window ends", async () => {
        const wrapper = await readyScrollableTracker(mountTracker(2, true));

        const observer = latestObserver();
        const block = observer.elements[0];

        vi.advanceTimersByTime(300 + READING_RESTORE_GUARD_MS + 50);
        observer.trigger(block, true);
        advanceDwellMs(BLOCK_ONE_DWELL_MS);

        expect(getReadingProgress(TEST_CONTENT_ID)).toBe(50);
        wrapper.unmount();
    });
});
