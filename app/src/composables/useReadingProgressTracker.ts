import { computed, nextTick, onUnmounted, ref, watch, type Ref } from "vue";
import { useEventListener, type MaybeElement } from "@vueuse/core";
import { getReadingProgress, removeReadingProgress, setReadingProgress } from "@/contentProgress";
import { isPrerender } from "@/ssg/isPrerender";
import {
    READING_MIN_SCROLL_SAMPLE_MS,
    computeScrollVelocityWordsPerSec,
    countWords,
} from "@/util/readingTime";
import type { Uuid } from "luminary-shared";

/**
 * Tracks article reading progress for the "Continue reading" homepage row.
 *
 as per these new changes progress is position-based. It is how far down the article body the bottom of the
 * viewport has reached (0-100), and the saved value follows where the reader last stopped —
 * up or down. It no longer depends on dwell time, skim detection or per-segment confirmation,
 * so reaching the end of the last paragraph is always 100%.
 *
 * The segment is still exported (and tested), but the composable itself
 * no longer uses them.
 *
 * @see app/docs/reading-progress-tracker/README.md
 */

const BLOCK_SELECTOR = "p, h1, h2, h3, h4, li, blockquote, pre";

/** Block must be at least this fraction visible within the scroll root. */
export const READING_INTERSECTION_RATIO = 0.5;

/** Ignore velocity samples shorter than this (trackpad / layout jitter). */
export { READING_MIN_SCROLL_SAMPLE_MS };

/** Suppress progress updates while restoreScrollPosition runs. */
export const READING_RESTORE_GUARD_MS = 400;

/** Subpixel tolerance when comparing block bottom to viewport bottom. */
export const READING_BLOCK_END_TOLERANCE_PX = 4;

/** Fractional scroll positions and zoom mean the end rarely lands on an exact integer. */
export const READING_SCROLL_END_TOLERANCE_PX = 2;

/**
 * Debounce for the ResizeObserver → re-collect pass. On Android the URL bar
 * collapsing/expanding resizes the viewport during normal scrolling; without a
 * debounce every such change re-runs querySelectorAll + a layout read per block.
 */
export const READING_RESIZE_DEBOUNCE_MS = 200;

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

export function isBlockEligibleForDwell(entry: IntersectionObserverEntry): boolean {
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
export function segmentWordCount(segment: ReadingSegment, elementHeightPx?: number): number {
    const totalWords = countWords(segment.sourceEl.textContent ?? "");
    if (totalWords <= 0) return 0;

    const totalHeight = elementHeightPx ?? segment.sourceEl.getBoundingClientRect().height;
    if (totalHeight <= 0) return 0;

    const segmentHeight = segment.bottomPx - segment.topPx;
    return Math.round((segmentHeight / totalHeight) * totalWords);
}

/**
 * True when the container scrolls and is resting at its end. A container that cannot scroll
 * is not "at the end": everything already fits, so gate 1b needs no relief — and one that has
 * not been laid out yet reports zeroes, which would otherwise read as the end of the article.
 */
export function isScrollAtEnd(
    container: HTMLElement | Window,
    tolerancePx = READING_SCROLL_END_TOLERANCE_PX,
): boolean {
    const { offset, visible, total } =
        container === window
            ? {
                  offset: window.scrollY,
                  visible: window.innerHeight,
                  total: document.documentElement?.scrollHeight ?? 0,
              }
            : {
                  offset: (container as HTMLElement).scrollTop,
                  visible: (container as HTMLElement).clientHeight,
                  total: (container as HTMLElement).scrollHeight,
              };

    if (total <= visible) return false;

    return offset + visible >= total - tolerancePx;
}

export function isSegmentEligible(
    segment: ReadingSegment,
    elementRect: Pick<DOMRectReadOnly, "top">,
    viewport: ViewportBounds,
    atScrollEnd = false,
): boolean {
    const segmentTop = elementRect.top + segment.topPx;
    const segmentBottom = elementRect.top + segment.bottomPx;
    const segmentHeight = segment.bottomPx - segment.topPx;

    if (segmentHeight <= 0) return false;

    const visibleTop = Math.max(segmentTop, viewport.top);
    const visibleBottom = Math.min(segmentBottom, viewport.bottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);

    if (visibleHeight / segmentHeight < READING_INTERSECTION_RATIO) return false;

    // Gate 1b asks that the reader scrolled through the segment rather than glimpsing its
    // top. At the end of the scroll there is nothing left to scroll, so a trailing segment
    // whose bottom never clears the viewport would otherwise be unreachable — and with it
    // 100%. The dwell and skim gates still have to pass.
    if (atScrollEnd) return true;

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
        container === window ? window.innerHeight : (container as HTMLElement).clientHeight;
    return height > 0 ? height : window.innerHeight;
}

export function useReadingProgressTracker(options: {
    contentId: Ref<Uuid | undefined>;
    articleRoot: Ref<HTMLElement | null>;
    /**
     * Element the visual scroll progress is measured over; defaults to `articleRoot`. Pass a
     * wider wrapper (title through prose) so the bar starts filling as soon as the reader
     * scrolls, not only once the body text reaches the top.
     */
    progressRoot?: Ref<HTMLElement | null>;
    scrollContainer: Ref<HTMLElement | Window>;
    enabled: Ref<boolean>;
    /** Language averageReadingSpeed (words per minute). No longer used: progress is position-based. */
    averageReadingSpeed: Ref<number | undefined>;
    /**
     * Whether to disable saving progress to local storage (e.g. for short articles).
     * Internal tracking for affinity still runs.
     */
    disableSaving?: Ref<boolean>;
    /**
     * Called once, right before internal tracking state is torn down for a content id
     * that had an active session — i.e. on a real content change, `enabled` flipping to
     * false, or unmount. NOT called for a session that never produced any segments (empty
     * article) or that never had `trackedContentId` set (nothing was actively tracked).
     * Receives the ending content id and its final depth as the furthest point of the article
     * reached (0-100) — read from live in-memory state, not the persisted store (which
     * deletes its entry once progress reaches 100, so it cannot answer "what was the final
     * depth" after a completed read).
     */
    onSessionEnd?: (endedContentId: Uuid, finalDepthPercent: number) => void;
}) {
    // Kept for consumers of the composable; filled by collectSegments.
    const segments = ref<ReadingSegment[]>([]);
    const sourceElements = ref<MaybeElement[]>([]);
    let lastSavedProgress = -1;
    // Furthest point of the article reached (0-100). Only used for onSessionEnd.
    let furthestPercent = 0;
    // NEW: becomes true once the reader has reached the saved point during this visit. Until
    // then a position BELOW the saved one is not saved, so stray scroll events when an article
    // opens (page scroll reset, layout shifts) cannot overwrite the saved position before the
    // reader has chosen "Continue".
    let hasReachedSaved = false;
    let trackedContentId: Uuid | undefined;
    let resizeObserver: ResizeObserver | null = null;
    let resizeDebounceId: ReturnType<typeof setTimeout> | null = null;

    const isRestoring = ref(false);

    const savedProgressPercent = computed(() => {
        const id = options.contentId.value;
        if (!id) return 0;
        return getReadingProgress(id);
    });

    const initialSavedProgressPercent = ref(0);
    const hasResumableProgress = computed(() => {
        const p = savedProgressPercent.value;
        return p > 0 && p < 100;
    });
    const hasResumableProgressOnOpen = computed(() => {
        const p = initialSavedProgressPercent.value;
        return p > 0 && p < 100;
    });

    // Live reading progress for the top-bar pill: the current position in the article, kept
    // even when saving is disabled for short articles, so the indicator always has a value.
    const readingProgressPercent = ref(0);

    // Scroll position within the article for the chapter pill's track. Deliberately separate
    // from the reading progress above: this follows the viewport frame by frame.
    const scrollProgressPercent = ref(0);
    let progressRafPending = false;

    // Nothing below this means anything without a viewport, and a server render disposes no
    // scope: listeners, observers and frame callbacks registered here would stay on the mock
    // window and hold the page — article text included — for the rest of the build. Guarded on
    // isPrerender rather than a `window` check, since vite-ssg's mock makes it exist in Node.
    if (isPrerender()) {
        return {
            segments,
            sourceElements,
            isRestoring,
            savedProgressPercent,
            hasResumableProgress,
            hasResumableProgressOnOpen,
            readingProgressPercent,
            scrollProgressPercent,
            restoreScrollPosition,
            setup,
        };
    }

    function computeScrollProgress() {
        const el = options.progressRoot?.value ?? options.articleRoot.value;
        if (!el) {
            scrollProgressPercent.value = 0;
            return;
        }

        const rect = el.getBoundingClientRect();
        if (rect.height <= 0) {
            scrollProgressPercent.value = 0;
            return;
        }

        const container = options.scrollContainer.value;
        const containerRect =
            container === window
                ? { top: 0, bottom: window.innerHeight }
                : (container as HTMLElement).getBoundingClientRect();
        const viewportHeight = containerRect.bottom - containerRect.top;

        // Reader position: 0 once the article's top reaches the viewport top, 100 once its
        // bottom reaches the viewport bottom. An article shorter than the viewport can't
        // travel that way, so it fills as it comes into view instead.
        const travel = rect.height - viewportHeight;
        const percent =
            travel > 0
                ? ((containerRect.top - rect.top) / travel) * 100
                : ((containerRect.bottom - rect.top) / rect.height) * 100;
        scrollProgressPercent.value = Math.min(100, Math.max(0, Math.round(percent)));
    }

    function scheduleProgressUpdate() {
        if (progressRafPending) return;
        progressRafPending = true;
        requestAnimationFrame(() => {
            progressRafPending = false;
            computeScrollProgress();
        });
    }

    useEventListener(options.scrollContainer, "scroll", scheduleProgressUpdate, { passive: true });

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

    function emitSessionEnd() {
        if (!trackedContentId || segments.value.length === 0) return;
        const finalDepthPercent = Math.round(
            (confirmedSegments.size / segments.value.length) * 100,
        );
        options.onSessionEnd?.(trackedContentId, finalDepthPercent);
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
        visibilityRafPending = false;
        isRestoring.value = false;
        initialSavedProgressPercent.value = 0;
    }

    function collectSegments() {
        segmentsByElement.clear();
        segmentWordsById.clear();
        segmentWordsPerPixel.clear();
        intersectingElements.clear();

        if (!options.articleRoot.value) {
            segmentList = [];
            segments.value = [];
            sourceElements.value = [];
            return;
        }

        const maxSegmentHeight = getMaxSegmentHeight(options.scrollContainer.value);
        const elements = Array.from(
            options.articleRoot.value.querySelectorAll(BLOCK_SELECTOR),
        ).filter((el) => el.textContent?.trim()) as Element[];

        // The one place layout (rect) and text (word count) are read: once per block,
        // per collect. Every hot path below works from these precomputed maps.
        const allSegments: ReadingSegment[] = [];
        elements.forEach((el, index) => {
            const height = el.getBoundingClientRect().height;
            const elSegments = splitElementIntoSegments(el, maxSegmentHeight, index, height);
            if (!elSegments.length) return;

            for (const segment of elSegments) {
                const words = segmentWordCount(segment, height);
                const segmentHeight = segment.bottomPx - segment.topPx;
                segmentWordsById.set(segment.id, words);
                segmentWordsPerPixel.set(segment.id, estimateWordsPerPixel(words, segmentHeight));
            }
            segmentsByElement.set(el, elSegments);
            allSegments.push(...elSegments);
        });

        segmentList = allSegments;
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

    /**
     * How far down the article body the bottom of the viewport has reached (0-100).
     * 100 exactly once the end of the last paragraph is on screen.
     */
    function computeReachedPercent(): number | null {
        const el = options.articleRoot.value;
        if (!el) return null;

        const rect = el.getBoundingClientRect();
        if (rect.height <= 0) return null;

        const viewport = getViewportBounds();
        if (rect.bottom <= viewport.bottom + READING_BLOCK_END_TOLERANCE_PX) return 100;

        const percent = ((viewport.bottom - rect.top) / rect.height) * 100;
        return Math.min(100, Math.max(0, Math.floor(percent)));
    }

    /**
     * saves the given position as-is (it used to keep only the highest value ever
     * reached). 100 means finished and removes the entry; 0 means nothing to resume.
     */
    function persistProgress(progress: number) {
        const id = options.contentId.value;
        if (!id) return;

        readingProgressPercent.value = progress;

        if (progress === lastSavedProgress) return;
        lastSavedProgress = progress;

        if (progress >= 100) {
            removeReadingProgress(id);
        } else if (progress > 0) {
            if (!options.disableSaving?.value) {
                setReadingProgress(id, progress);
            }
        } else {
            removeReadingProgress(id);
        }
    }

    /** Called while the reader scrolls (at most once per frame). */
    function updateReadingProgress() {
        if (!options.enabled.value || isRestoring.value) return;

        const id = options.contentId.value;
        if (!id) return;

        const reached = computeReachedPercent();
        if (reached === null) return;

        furthestPercent = Math.max(furthestPercent, reached);

        // CHANGED: the saved position follows where the reader last stopped, up or down. The
        // only exception is the start of a visit: positions below the saved one are ignored
        // until the reader has reached the saved point (see hasReachedSaved).
        if (!hasReachedSaved) {
            if (reached < getReadingProgress(id)) return;
            hasReachedSaved = true;
        }

        persistProgress(reached);
    }

    function scheduleProgressUpdate() {
        if (progressRafPending) return;
        progressRafPending = true;
        requestAnimationFrame(() => {
            progressRafPending = false;
            computeScrollProgress();
            updateReadingProgress();
        });
    }

    useEventListener(options.scrollContainer, "scroll", scheduleProgressUpdate, { passive: true });

    function emitSessionEnd() {
        if (!trackedContentId || segments.value.length === 0) return;
        options.onSessionEnd?.(trackedContentId, furthestPercent);
    }

    function resetTrackingState() {
        lastSavedProgress = -1;
        furthestPercent = 0;
        hasReachedSaved = false;
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
            const height = el.getBoundingClientRect().height;
            const elSegments = splitElementIntoSegments(el, maxSegmentHeight, index, height);
            if (!elSegments.length) return;
            allSegments.push(...elSegments);
        });

        segments.value = allSegments;
        sourceElements.value = elements as MaybeElement[];
    }

    /** Pick up the saved position when an article opens, so the pill and session depth start from it. */
    function seedFromSavedProgress() {
        const id = options.contentId.value;
        if (!id) return;

        const saved = getReadingProgress(id);
        if (saved <= 0) return;

        readingProgressPercent.value = saved;
        furthestPercent = saved;
        lastSavedProgress = saved;
    }

    function teardownResizeObserver() {
        resizeObserver?.disconnect();
        resizeObserver = null;
        if (resizeDebounceId != null) {
            clearTimeout(resizeDebounceId);
            resizeDebounceId = null;
        }
    }

    function setupResizeObserver() {
        teardownResizeObserver();

        const container = options.scrollContainer.value;
        const target =
            container === window
                ? document.documentElement
                : container instanceof HTMLElement
                  ? container
                  : null;

        if (!target || typeof ResizeObserver === "undefined") return;

        // Debounced: on Android the URL bar collapse/expand resizes the viewport during
        // ordinary scrolling — re-collecting (querySelectorAll + a layout read per
        // block) on every such event would jank the scroll it interrupts.
        resizeObserver = new ResizeObserver(() => {
            if (!options.enabled.value) return;
            if (resizeDebounceId != null) clearTimeout(resizeDebounceId);
            resizeDebounceId = setTimeout(() => {
                resizeDebounceId = null;
                if (!options.enabled.value) return;
                collectSegments();
                computeScrollProgress();
            }, READING_RESIZE_DEBOUNCE_MS);
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
            const article = options.articleRoot.value;
            if (!article) return;

            const maxScroll =
                container === window
                    ? document.documentElement.scrollHeight - window.innerHeight
                    : (container as HTMLElement).scrollHeight -
                      (container as HTMLElement).clientHeight;

            if (maxScroll <= 0) return;

            // Saved progress is a point inside the ARTICLE, not a share of the whole scroll
            // container (which also holds the title, hero and related content). This is the
            // inverse of computeReachedPercent: scroll so that point of the article sits at
            // the bottom of the viewport.
            const rect = article.getBoundingClientRect();
            const viewport = getViewportBounds();
            const pointY = rect.top + (percent / 100) * rect.height;
            const targetY = Math.max(
                0,
                Math.round(getScrollTop(container) + pointY - viewport.bottom),
            );

            isRestoring.value = true;

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
            }, READING_RESTORE_GUARD_MS);
        }, 300);
    }

    function setup(contentChanged: boolean) {
        collectSegments();
        setupResizeObserver();
        computeScrollProgress();

        if (!options.enabled.value) return;

        if (contentChanged) {
            const id = options.contentId.value;
            initialSavedProgressPercent.value = id ? getReadingProgress(id) : 0;
            if (segments.value.length > 0) {
                seedFromSavedProgress();
            }
        }

        if (segments.value.length === 0) return;
    }

    watch(
        [options.enabled, options.contentId, options.articleRoot, options.scrollContainer],
        ([enabled, id], oldValues) => {
            if (!enabled) {
                emitSessionEnd();
                resetTrackingState();
                segments.value = [];
                sourceElements.value = [];
                teardownResizeObserver();
                trackedContentId = undefined;
                readingProgressPercent.value = 0;
                scrollProgressPercent.value = 0;
                return;
            }

            const prevId = oldValues?.[1] as Uuid | undefined;
            const contentChanged = oldValues !== undefined && prevId !== undefined && id !== prevId;

            if (contentChanged || trackedContentId !== id) {
                emitSessionEnd();
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
        emitSessionEnd();
        resetTrackingState();
        teardownResizeObserver();
    });

    return {
        segments,
        sourceElements,
        isRestoring,
        savedProgressPercent,
        hasResumableProgress,
        hasResumableProgressOnOpen,
        readingProgressPercent,
        scrollProgressPercent,
        restoreScrollPosition,
        setup,
    };
}
