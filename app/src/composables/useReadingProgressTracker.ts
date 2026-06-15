import { computed, nextTick, onUnmounted, ref, watch, type Ref } from "vue";
import { useEventListener, useIntersectionObserver, type MaybeElement } from "@vueuse/core";
import {
    getReadingProgress,
    removeReadingProgress,
    setReadingProgress,
} from "@/globalConfig";
import {
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
 * A segment is confirmed only when all gates pass:
 *  1. ≥50% visible in the scroll container
 *  1b. Segment bottom edge inside the viewport
 *  2. Scroll speed below skim cap (words/s, from rendered segment density)
 *  3. Dwell time reached (active segment only — topmost unread eligible segment)
 *
 * Long prose blocks are split into viewport-height segments so gate 1b can pass.
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

export type ReadingSegment = {
    id: string;
    sourceEl: Element;
    segmentIndex: number;
    segmentCount: number;
    topPx: number;
    bottomPx: number;
};

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

/** Split a prose element into viewport-height tracking segments. */
export function splitElementIntoSegments(
    sourceEl: Element,
    maxSegmentHeight: number,
    elementIndex: number,
    elementHeightPx?: number,
): ReadingSegment[] {
    const height = elementHeightPx ?? sourceEl.getBoundingClientRect().height;
    if (height <= 0) return [];

    const effectiveMax = Math.max(1, maxSegmentHeight);
    const segmentCount = height <= effectiveMax ? 1 : Math.ceil(height / effectiveMax);
    const segmentHeight = height / segmentCount;

    const segments: ReadingSegment[] = [];
    for (let i = 0; i < segmentCount; i++) {
        segments.push({
            id: `reading-segment-${elementIndex}-${i}`,
            sourceEl,
            segmentIndex: i,
            segmentCount,
            topPx: i * segmentHeight,
            bottomPx: (i + 1) * segmentHeight,
        });
    }
    return segments;
}

/** Word count for a segment — proportional share of the parent element. */
export function segmentWordCount(
    segment: ReadingSegment,
    elementHeightPx?: number,
): number {
    const totalWords = countWords(segment.sourceEl.textContent ?? "");
    if (totalWords <= 0) return 0;

    const totalHeight = elementHeightPx ?? segment.sourceEl.getBoundingClientRect().height;
    if (totalHeight <= 0) return 0;

    const segmentHeight = segment.bottomPx - segment.topPx;
    return Math.round((segmentHeight / totalHeight) * totalWords);
}

export function isSegmentEligible(
    segment: ReadingSegment,
    elementRect: Pick<DOMRectReadOnly, "top">,
    viewport: ViewportBounds,
): boolean {
    const segmentTop = elementRect.top + segment.topPx;
    const segmentBottom = elementRect.top + segment.bottomPx;
    const segmentHeight = segment.bottomPx - segment.topPx;

    if (segmentHeight <= 0) return false;

    const visibleTop = Math.max(segmentTop, viewport.top);
    const visibleBottom = Math.min(segmentBottom, viewport.bottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);

    if (visibleHeight / segmentHeight < READING_INTERSECTION_RATIO) return false;

    return isBlockEndInViewport(segmentBottom, viewport);
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

/** Topmost unread segment that is currently eligible for dwell (reading order). */
export function resolveActiveSegment(
    segments: ReadingSegment[],
    visibleSegments: Set<string>,
    confirmedSegments: Set<string>,
): ReadingSegment | null {
    for (const segment of segments) {
        if (visibleSegments.has(segment.id) && !confirmedSegments.has(segment.id)) {
            return segment;
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
 * Caller must pass wordsPerPixel from the active segment (> 0).
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

function getMaxSegmentHeight(container: HTMLElement | Window): number {
    const height =
        container === window
            ? window.innerHeight
            : (container as HTMLElement).clientHeight;
    return height > 0 ? height : window.innerHeight;
}

export function useReadingProgressTracker(options: {
    contentId: Ref<Uuid | undefined>;
    articleRoot: Ref<HTMLElement | null>;
    scrollContainer: Ref<HTMLElement | Window>;
    enabled: Ref<boolean>;
    /** Language averageReadingSpeed (words per minute); defaults to 200 when unset. */
    averageReadingSpeed: Ref<number | undefined>;
}) {
    const segments = ref<ReadingSegment[]>([]);
    const sourceElements = ref<MaybeElement[]>([]);
    const confirmedSegments = new Set<string>();
    const visibleSegments = new Set<string>();
    const segmentWordsPerPixel = new Map<string, number>();
    const dwellAccumulatedMs = new Map<string, number>();
    let lastSavedProgress = -1;
    let lastScrollY = 0;
    let lastScrollTime = 0;
    let skimScrollState: SkimScrollState = {
        pendingScrollDeltaY: 0,
        pendingScrollDeltaMs: 0,
        isSkimming: false,
    };
    let scrollRafPending = false;
    let dwellRafId: number | null = null;
    let lastDwellFrameTime = 0;
    let trackedContentId: Uuid | undefined;
    let resizeObserver: ResizeObserver | null = null;

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
        confirmedSegments.clear();
        visibleSegments.clear();
        segmentWordsPerPixel.clear();
        lastSavedProgress = -1;
        lastScrollY = 0;
        lastScrollTime = 0;
        skimScrollState = {
            pendingScrollDeltaY: 0,
            pendingScrollDeltaMs: 0,
            isSkimming: false,
        };
        scrollRafPending = false;
        isRestoring.value = false;
    }

    function collectSegments() {
        if (!options.articleRoot.value) {
            segments.value = [];
            sourceElements.value = [];
            return;
        }

        const maxSegmentHeight = getMaxSegmentHeight(options.scrollContainer.value);
        const elements = Array.from(
            options.articleRoot.value.querySelectorAll(BLOCK_SELECTOR),
        ).filter((el) => el.textContent?.trim()) as Element[];

        const allSegments: ReadingSegment[] = [];
        elements.forEach((el, index) => {
            allSegments.push(...splitElementIntoSegments(el, maxSegmentHeight, index));
        });

        segments.value = allSegments;
        sourceElements.value = elements as MaybeElement[];
    }

    function getViewportBounds(
        entry?: Pick<IntersectionObserverEntry, "rootBounds">,
    ): ViewportBounds {
        if (entry?.rootBounds) {
            return { top: entry.rootBounds.top, bottom: entry.rootBounds.bottom };
        }

        const container = options.scrollContainer.value;
        if (container === window) {
            return { top: 0, bottom: window.innerHeight };
        }

        const rect = (container as HTMLElement).getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
    }

    function cacheSegmentWordsPerPixel(segment: ReadingSegment) {
        const segmentHeight = segment.bottomPx - segment.topPx;
        const words = segmentWordCount(segment);
        segmentWordsPerPixel.set(segment.id, estimateWordsPerPixel(words, segmentHeight));
    }

    function activeSegmentWordsPerPixel(): number {
        const active = resolveActiveSegment(segments.value, visibleSegments, confirmedSegments);
        if (!active) return 0;
        return segmentWordsPerPixel.get(active.id) ?? 0;
    }

    function updateVisibilityForElement(
        el: Element,
        entry?: IntersectionObserverEntry,
    ) {
        if (entry && !entry.isIntersecting) {
            for (const segment of segments.value) {
                if (segment.sourceEl !== el) continue;
                visibleSegments.delete(segment.id);
                cancelDwell(segment.id);
            }
            return;
        }

        const viewport = getViewportBounds(entry);
        const rect = entry?.boundingClientRect ?? el.getBoundingClientRect();
        let startedDwell = false;

        for (const segment of segments.value) {
            if (segment.sourceEl !== el) continue;

            if (isSegmentEligible(segment, rect, viewport)) {
                cacheSegmentWordsPerPixel(segment);
                visibleSegments.add(segment.id);
                startedDwell = true;
            } else {
                visibleSegments.delete(segment.id);
                cancelDwell(segment.id);
            }
        }

        if (startedDwell && !isRestoring.value && !skimScrollState.isSkimming) {
            ensureDwellLoop();
        }
    }

    function refreshAllSegmentVisibility() {
        for (const el of sourceElements.value) {
            if (el instanceof Element) {
                updateVisibilityForElement(el);
            }
        }
    }

    /** Restore in-memory confirmed set from saved % so progress never drops on re-setup. */
    function seedConfirmedFromSavedProgress() {
        const id = options.contentId.value;
        if (!id || segments.value.length === 0) return;

        const saved = getReadingProgress(id);
        if (saved <= 0) return;

        confirmedSegments.clear();

        if (saved >= 100) {
            for (const segment of segments.value) {
                confirmedSegments.add(segment.id);
            }
            lastSavedProgress = 100;
            return;
        }

        const count = Math.round((saved / 100) * segments.value.length);
        for (let i = 0; i < count && i < segments.value.length; i++) {
            confirmedSegments.add(segments.value[i].id);
        }
        lastSavedProgress = saved;
    }

    function persistProgress() {
        const id = options.contentId.value;
        if (!id || segments.value.length === 0) return;

        const computedProgress = Math.round(
            (confirmedSegments.size / segments.value.length) * 100,
        );
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

    function markSegmentRead(segmentId: string) {
        if (confirmedSegments.has(segmentId)) return;
        confirmedSegments.add(segmentId);
        persistProgress();
    }

    function segmentDwellMs(segment: ReadingSegment): number {
        const words = segmentWordCount(segment);
        return computeBlockDwellMs(words, options.averageReadingSpeed.value);
    }

    function cancelDwell(segmentId: string) {
        dwellAccumulatedMs.delete(segmentId);
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

        if (lastDwellFrameTime === 0) {
            lastDwellFrameTime = timestamp;
            return;
        }

        const elapsed = timestamp - lastDwellFrameTime;
        lastDwellFrameTime = timestamp;
        if (elapsed <= 0) return;

        const activeSegment = resolveActiveSegment(
            segments.value,
            visibleSegments,
            confirmedSegments,
        );
        if (!activeSegment || confirmedSegments.has(activeSegment.id)) return;

        const requiredMs = segmentDwellMs(activeSegment);
        const accumulated = (dwellAccumulatedMs.get(activeSegment.id) ?? 0) + elapsed;

        if (accumulated >= requiredMs) {
            dwellAccumulatedMs.delete(activeSegment.id);
            markSegmentRead(activeSegment.id);
        } else {
            dwellAccumulatedMs.set(activeSegment.id, accumulated);
        }
    }

    function ensureDwellLoop() {
        if (dwellRafId == null && options.enabled.value) {
            if (lastDwellFrameTime === 0) {
                lastDwellFrameTime = performance.now();
            }
            dwellRafId = requestAnimationFrame(tickDwell);
        }
    }

    function restartDwellForVisibleBlocksAfterSpeedChange() {
        clearDwellAccumulation();
        ensureDwellLoop();
    }

    function cancelDwellForVisibleSegments() {
        for (const segmentId of visibleSegments) {
            cancelDwell(segmentId);
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

        if (lastScrollTime > 0) {
            const wordsPerPixel = activeSegmentWordsPerPixel();

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
        refreshAllSegmentVisibility();
    }

    function handleIntersection(entries: IntersectionObserverEntry[]) {
        for (const entry of entries) {
            updateVisibilityForElement(entry.target as Element, entry);
        }
    }

    const { stop: stopObserver } = useIntersectionObserver(sourceElements, handleIntersection, {
        root: observerRoot,
        threshold: [0, READING_INTERSECTION_RATIO, 1],
    });

    useEventListener(options.scrollContainer, "scroll", onScroll, { passive: true });

    function setupResizeObserver() {
        resizeObserver?.disconnect();
        resizeObserver = null;

        const container = options.scrollContainer.value;
        const target =
            container === window
                ? document.documentElement
                : container instanceof HTMLElement
                  ? container
                  : null;

        if (!target || typeof ResizeObserver === "undefined") return;

        resizeObserver = new ResizeObserver(() => {
            if (!options.enabled.value) return;
            const prevLength = segments.value.length;
            collectSegments();
            if (segments.value.length !== prevLength) {
                visibleSegments.clear();
                segmentWordsPerPixel.clear();
                clearDwellAccumulation();
                seedConfirmedFromSavedProgress();
                refreshAllSegmentVisibility();
            }
        });
        resizeObserver.observe(target);
    }

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
            cancelDwellForVisibleSegments();

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
                refreshAllSegmentVisibility();
            }, READING_RESTORE_GUARD_MS);
        }, 300);
    }

    function setup(contentChanged: boolean) {
        collectSegments();
        setupResizeObserver();

        if (!options.enabled.value) return;

        if (contentChanged) {
            if (segments.value.length > 0) {
                seedConfirmedFromSavedProgress();
            }
        }

        if (segments.value.length === 0) return;
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
                segments.value = [];
                sourceElements.value = [];
                resizeObserver?.disconnect();
                resizeObserver = null;
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
        resizeObserver?.disconnect();
        resizeObserver = null;
    });

    return {
        segments,
        sourceElements,
        isRestoring,
        savedProgressPercent,
        hasResumableProgress,
        restoreScrollPosition,
        setup,
    };
}
