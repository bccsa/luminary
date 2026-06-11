import { computed, nextTick, onUnmounted, ref, watch, type Ref } from "vue";
import { useEventListener, useIntersectionObserver, type MaybeElement } from "@vueuse/core";
import {
    getReadingProgress,
    removeReadingProgress,
    setReadingProgress,
} from "@/globalConfig";
import {
    READING_IDLE_MS,
    READING_MIN_SCROLL_SAMPLE_MS,
    computeBlockDwellMs,
    computeMaxScrollWordsPerSec,
    computeScrollVelocityWordsPerSec,
    countWords,
    estimateWordsPerPixel,
} from "@/util/readingTime";
import type { Uuid } from "luminary-shared";

/**
 * Tracks article reading progress for the "Continue reading" homepage row.
 *
 * A block is confirmed only when all gates pass:
 *  1. ≥50% visible in the scroll container
 *  1b. Block bottom edge inside the viewport
 *  2. Scroll speed below skim cap (words/s, from rendered block density)
 *  3. Dwell time reached (active block only — topmost unread eligible block)
 *  4. User not idle (45 s without scroll or intersection activity)
 *
 * @see docs/reading-progress-tracker.md
 */

const BLOCK_SELECTOR = "p, h1, h2, h3, h4, li, blockquote, pre";

/** Block must be at least this fraction visible within the scroll root. */
export const READING_INTERSECTION_RATIO = 0.5;

/** Ignore velocity samples shorter than this (trackpad / layout jitter). */
export { READING_MIN_SCROLL_SAMPLE_MS };

/** Suppress velocity sampling and dwell while restoreScrollPosition runs. */
export const READING_RESTORE_GUARD_MS = 400;

/** Subpixel tolerance when comparing block bottom to viewport bottom. */
export const READING_BLOCK_END_TOLERANCE_PX = 4;

export type ViewportBounds = { top: number; bottom: number };

export function isBlockEndInViewport(
    blockBottom: number,
    viewport: ViewportBounds,
    tolerancePx = READING_BLOCK_END_TOLERANCE_PX,
): boolean {
    return (
        blockBottom <= viewport.bottom + tolerancePx && blockBottom >= viewport.top - tolerancePx
    );
}

export function isBlockEndVisibleInEntry(
    entry: Pick<IntersectionObserverEntry, "boundingClientRect" | "rootBounds" | "isIntersecting">,
): boolean {
    if (!entry.isIntersecting) return false;

    const rect = entry.boundingClientRect;
    const root = entry.rootBounds;
    const viewport: ViewportBounds = root
        ? { top: root.top, bottom: root.bottom }
        : { top: 0, bottom: window.innerHeight };

    return isBlockEndInViewport(rect.bottom, viewport);
}

export function isBlockEligibleForDwell(
    entry: IntersectionObserverEntry,
): boolean {
    return (
        entry.isIntersecting &&
        entry.intersectionRatio >= READING_INTERSECTION_RATIO &&
        isBlockEndVisibleInEntry(entry)
    );
}

/** Topmost unread block that is currently eligible for dwell (reading order). */
export function resolveActiveBlock(
    blocks: MaybeElement[],
    visibleBlocks: Set<MaybeElement>,
    confirmedBlocks: Set<MaybeElement>,
): MaybeElement | null {
    for (const el of blocks) {
        if (el && visibleBlocks.has(el) && !confirmedBlocks.has(el)) {
            return el;
        }
    }
    return null;
}

/** Batched scroll samples for gate 2 (skim detection). */
export type SkimScrollState = {
    pendingScrollDeltaY: number;
    pendingScrollDeltaMs: number;
    /** True while the latest measured scroll speed exceeds the skim cap. */
    isSkimming: boolean;
};

/**
 * Batch short scroll samples, then compare words/s to the skim cap.
 * Caller must pass wordsPerPixel from the active block (> 0).
 */
export function applyScrollVelocitySample(
    state: SkimScrollState,
    deltaY: number,
    deltaMs: number,
    wordsPerPixel: number,
    maxWordsPerSec: number,
): { isSkimming: boolean; justStoppedSkimming: boolean; state: SkimScrollState } {
    const next: SkimScrollState = {
        pendingScrollDeltaY: state.pendingScrollDeltaY + deltaY,
        pendingScrollDeltaMs: state.pendingScrollDeltaMs + deltaMs,
        isSkimming: state.isSkimming,
    };

    if (next.pendingScrollDeltaMs < READING_MIN_SCROLL_SAMPLE_MS) {
        return { isSkimming: next.isSkimming, justStoppedSkimming: false, state: next };
    }

    const wordsPerSecond = computeScrollVelocityWordsPerSec(
        next.pendingScrollDeltaY,
        next.pendingScrollDeltaMs,
        wordsPerPixel,
    );
    next.pendingScrollDeltaY = 0;
    next.pendingScrollDeltaMs = 0;

    if (wordsPerPixel > 0 && wordsPerSecond > maxWordsPerSec) {
        next.isSkimming = true;
        return { isSkimming: true, justStoppedSkimming: false, state: next };
    }

    const justStoppedSkimming = next.isSkimming;
    next.isSkimming = false;
    return { isSkimming: false, justStoppedSkimming, state: next };
}

/** Prefer BasePage `<main>` — it scrolls, not the window. */
export function resolveArticleScrollContainer(): HTMLElement | Window {
    const main = document.querySelector("main");
    if (main instanceof HTMLElement) {
        const { overflowY } = getComputedStyle(main);
        if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
            return main;
        }
    }
    const fallback = document.querySelector(".scroll-container, [data-scroll-container]");
    if (fallback instanceof HTMLElement) return fallback;
    return window;
}

function getScrollTop(container: HTMLElement | Window): number {
    return container === window ? window.scrollY : (container as HTMLElement).scrollTop;
}

export function useReadingProgressTracker(options: {
    contentId: Ref<Uuid | undefined>;
    articleRoot: Ref<HTMLElement | null>;
    scrollContainer: Ref<HTMLElement | Window>;
    enabled: Ref<boolean>;
    /** Language averageReadingSpeed (words per minute); defaults to 200 when unset. */
    averageReadingSpeed: Ref<number | undefined>;
}) {
    const blocks = ref<MaybeElement[]>([]);
    const confirmedBlocks = new Set<MaybeElement>();
    const visibleBlocks = new Set<MaybeElement>();
    const blockWordsPerPixel = new WeakMap<Element, number>();
    const dwellAccumulatedMs = new Map<MaybeElement, number>();
    let lastSavedProgress = -1;
    let lastScrollY = 0;
    let lastScrollTime = 0;
    let lastActivityMs: number | null = null;
    let skimScrollState: SkimScrollState = {
        pendingScrollDeltaY: 0,
        pendingScrollDeltaMs: 0,
        isSkimming: false,
    };
    let scrollRafPending = false;
    let dwellRafId: number | null = null;
    let lastDwellFrameTime = 0;
    let trackedContentId: Uuid | undefined;

    const isRestoring = ref(false);

    const maxScrollWordsPerSec = computed(() =>
        computeMaxScrollWordsPerSec(options.averageReadingSpeed.value),
    );

    const savedProgressPercent = computed(() => {
        const id = options.contentId.value;
        if (!id) return 0;
        return getReadingProgress(id);
    });

    const hasResumableProgress = computed(() => {
        const p = savedProgressPercent.value;
        return p > 0 && p < 100;
    });

    const observerRoot = computed(() =>
        options.scrollContainer.value === window
            ? null
            : (options.scrollContainer.value as HTMLElement),
    );

    function touchActivity(timestamp = performance.now()) {
        lastActivityMs = timestamp;
    }

    function stopDwellLoop() {
        if (dwellRafId != null) {
            cancelAnimationFrame(dwellRafId);
            dwellRafId = null;
        }
        lastDwellFrameTime = 0;
    }

    function clearDwellAccumulation() {
        dwellAccumulatedMs.clear();
    }

    function resetTrackingState() {
        stopDwellLoop();
        clearDwellAccumulation();
        confirmedBlocks.clear();
        visibleBlocks.clear();
        lastSavedProgress = -1;
        lastScrollY = 0;
        lastScrollTime = 0;
        lastActivityMs = null;
        skimScrollState = {
            pendingScrollDeltaY: 0,
            pendingScrollDeltaMs: 0,
            isSkimming: false,
        };
        scrollRafPending = false;
        isRestoring.value = false;
    }

    function collectBlocks() {
        if (!options.articleRoot.value) {
            blocks.value = [];
            return;
        }

        blocks.value = Array.from(
            options.articleRoot.value.querySelectorAll(BLOCK_SELECTOR),
        ).filter((el) => el.textContent?.trim()) as MaybeElement[];
    }

    function cacheBlockWordsPerPixel(el: MaybeElement) {
        if (!(el instanceof Element)) return;
        const height = el.getBoundingClientRect().height;
        const words = countWords(el.textContent ?? "");
        blockWordsPerPixel.set(el, estimateWordsPerPixel(words, height));
    }

    function activeBlockWordsPerPixel(): number {
        const active = resolveActiveBlock(blocks.value, visibleBlocks, confirmedBlocks);
        if (!(active instanceof Element)) return 0;
        return blockWordsPerPixel.get(active) ?? 0;
    }

    /** Restore in-memory confirmed set from saved % so progress never drops on re-setup. */
    function seedConfirmedFromSavedProgress() {
        const id = options.contentId.value;
        if (!id || blocks.value.length === 0) return;

        const saved = getReadingProgress(id);
        if (saved <= 0) return;

        if (saved >= 100) {
            for (const el of blocks.value) {
                if (el instanceof Element) confirmedBlocks.add(el);
            }
            lastSavedProgress = 100;
            return;
        }

        const count = Math.round((saved / 100) * blocks.value.length);
        for (let i = 0; i < count && i < blocks.value.length; i++) {
            const el = blocks.value[i];
            if (el instanceof Element) confirmedBlocks.add(el);
        }
        lastSavedProgress = saved;
    }

    function persistProgress() {
        const id = options.contentId.value;
        if (!id || blocks.value.length === 0) return;

        const computedProgress = Math.round((confirmedBlocks.size / blocks.value.length) * 100);
        const existing = getReadingProgress(id);
        const progress = Math.max(existing, computedProgress);

        if (progress === lastSavedProgress) return;
        lastSavedProgress = progress;

        if (progress >= 100) {
            removeReadingProgress(id);
        } else if (progress > 0) {
            setReadingProgress(id, progress);
        }
    }

    function markBlockRead(el: MaybeElement) {
        if (!el || confirmedBlocks.has(el)) return;
        confirmedBlocks.add(el);
        persistProgress();
    }

    function blockDwellMs(el: MaybeElement): number {
        if (!(el instanceof Element)) return computeBlockDwellMs(0);
        const words = countWords(el.textContent ?? "");
        return computeBlockDwellMs(words, options.averageReadingSpeed.value);
    }

    function cancelDwell(el: MaybeElement) {
        dwellAccumulatedMs.delete(el);
    }

    /** Gate 2: stationary reading after a skim burst should resume dwell. */
    function clearSkimmingIfScrollStopped(now: number) {
        if (
            skimScrollState.isSkimming &&
            lastScrollTime > 0 &&
            now - lastScrollTime >= READING_MIN_SCROLL_SAMPLE_MS
        ) {
            skimScrollState = { ...skimScrollState, isSkimming: false };
        }
    }

    function tickDwell(timestamp: number) {
        dwellRafId = requestAnimationFrame(tickDwell);

        const now = performance.now();
        clearSkimmingIfScrollStopped(now);

        if (!options.enabled.value || isRestoring.value || skimScrollState.isSkimming) {
            lastDwellFrameTime = timestamp;
            return;
        }
        if (lastActivityMs !== null && now - lastActivityMs >= READING_IDLE_MS) {
            clearDwellAccumulation();
            lastDwellFrameTime = timestamp;
            return;
        }

        if (lastDwellFrameTime === 0) {
            lastDwellFrameTime = timestamp;
            return;
        }

        const elapsed = timestamp - lastDwellFrameTime;
        lastDwellFrameTime = timestamp;
        if (elapsed <= 0) return;

        const activeBlock = resolveActiveBlock(blocks.value, visibleBlocks, confirmedBlocks);
        if (!activeBlock || confirmedBlocks.has(activeBlock)) return;

        const requiredMs = blockDwellMs(activeBlock);
        const accumulated = (dwellAccumulatedMs.get(activeBlock) ?? 0) + elapsed;

        if (accumulated >= requiredMs) {
            dwellAccumulatedMs.delete(activeBlock);
            markBlockRead(activeBlock);
        } else {
            dwellAccumulatedMs.set(activeBlock, accumulated);
        }
    }

    function ensureDwellLoop() {
        if (dwellRafId == null && options.enabled.value) {
            if (lastDwellFrameTime === 0) {
                lastDwellFrameTime = performance.now();
            }
            if (lastActivityMs === null) {
                touchActivity();
            }
            dwellRafId = requestAnimationFrame(tickDwell);
        }
    }

    function startDwellIfEligible(el: MaybeElement) {
        if (!el || confirmedBlocks.has(el)) return;
        if (!visibleBlocks.has(el) || isRestoring.value || skimScrollState.isSkimming) return;
        ensureDwellLoop();
    }

    function restartDwellForVisibleBlocksAfterSpeedChange() {
        clearDwellAccumulation();
        ensureDwellLoop();
    }

    function cancelDwellForVisibleBlocks() {
        for (const el of visibleBlocks) {
            cancelDwell(el);
        }
    }

    function onSkimmingDetected() {
        clearDwellAccumulation();
        skimScrollState = { ...skimScrollState, isSkimming: true };
    }

    function onScroll() {
        if (!options.enabled.value || isRestoring.value) return;

        const container = options.scrollContainer.value;
        const scrollY = getScrollTop(container);
        const now = performance.now();
        touchActivity(now);

        if (lastScrollTime > 0) {
            const wordsPerPixel = activeBlockWordsPerPixel();

            if (wordsPerPixel > 0) {
                const { isSkimming, justStoppedSkimming, state } = applyScrollVelocitySample(
                    skimScrollState,
                    scrollY - lastScrollY,
                    now - lastScrollTime,
                    wordsPerPixel,
                    maxScrollWordsPerSec.value,
                );
                skimScrollState = state;

                if (isSkimming) {
                    onSkimmingDetected();
                } else if (justStoppedSkimming) {
                    if (!scrollRafPending) {
                        scrollRafPending = true;
                        requestAnimationFrame(() => {
                            scrollRafPending = false;
                            ensureDwellLoop();
                        });
                    }
                }
            }
        }

        lastScrollY = scrollY;
        lastScrollTime = now;
    }

    function handleIntersection(entries: IntersectionObserverEntry[]) {
        touchActivity();
        for (const entry of entries) {
            const el = entry.target as MaybeElement;
            const eligible = isBlockEligibleForDwell(entry);

            if (eligible) {
                cacheBlockWordsPerPixel(el);
                visibleBlocks.add(el);
                startDwellIfEligible(el);
            } else {
                visibleBlocks.delete(el);
                cancelDwell(el);
            }
        }
    }

    const { stop: stopObserver } = useIntersectionObserver(blocks, handleIntersection, {
        root: observerRoot,
        threshold: [0, READING_INTERSECTION_RATIO, 1],
    });

    useEventListener(options.scrollContainer, "scroll", onScroll, { passive: true });

    function restoreScrollPosition() {
        const id = options.contentId.value;
        if (!id) return;

        const percent = getReadingProgress(id);
        if (!percent || percent >= 100) return;

        setTimeout(() => {
            const container = options.scrollContainer.value;
            const maxScroll =
                container === window
                    ? document.documentElement.scrollHeight - window.innerHeight
                    : (container as HTMLElement).scrollHeight -
                      (container as HTMLElement).clientHeight;

            if (maxScroll <= 0) return;

            const targetY = Math.round((percent / 100) * maxScroll);

            isRestoring.value = true;
            cancelDwellForVisibleBlocks();

            if (container === window) {
                window.scrollTo({ top: targetY });
            } else {
                const el = container as HTMLElement;
                if (typeof el.scrollTo === "function") {
                    el.scrollTo({ top: targetY });
                } else {
                    el.scrollTop = targetY;
                }
            }

            setTimeout(() => {
                isRestoring.value = false;
                lastScrollTime = 0;
                skimScrollState = {
                    pendingScrollDeltaY: 0,
                    pendingScrollDeltaMs: 0,
                    isSkimming: false,
                };
                lastScrollY = getScrollTop(container);
                touchActivity();
            }, READING_RESTORE_GUARD_MS);
        }, 300);
    }

    function setup(contentChanged: boolean) {
        collectBlocks();

        if (!options.enabled.value) return;

        if (contentChanged) {
            if (blocks.value.length > 0) {
                seedConfirmedFromSavedProgress();
            }
            touchActivity();
            restoreScrollPosition();
        }

        if (blocks.value.length === 0) return;
    }

    watch(options.averageReadingSpeed, () => {
        if (!options.enabled.value) return;
        restartDwellForVisibleBlocksAfterSpeedChange();
    });

    watch(
        [options.enabled, options.contentId, options.articleRoot, options.scrollContainer],
        ([enabled, id], oldValues) => {
            if (!enabled) {
                resetTrackingState();
                blocks.value = [];
                trackedContentId = undefined;
                return;
            }

            const prevId = oldValues?.[1] as Uuid | undefined;
            const contentChanged =
                oldValues !== undefined && prevId !== undefined && id !== prevId;

            if (contentChanged || trackedContentId !== id) {
                resetTrackingState();
                trackedContentId = id;
                nextTick(() => setup(true));
                return;
            }

            nextTick(() => setup(false));
        },
        { flush: "post", immediate: true },
    );

    onUnmounted(() => {
        resetTrackingState();
        stopObserver();
    });

    return {
        blocks,
        isRestoring,
        savedProgressPercent,
        hasResumableProgress,
        restoreScrollPosition,
        setup,
    };
}
