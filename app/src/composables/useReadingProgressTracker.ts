import { computed, nextTick, onUnmounted, ref, watch, type Ref } from "vue";
import { useEventListener, useIntersectionObserver, type MaybeElement } from "@vueuse/core";
import {
    getReadingProgress,
    removeReadingProgress,
    setReadingProgress,
} from "@/globalConfig";
import { computeBlockDwellMs, countWords } from "@/util/readingTime";
import type { Uuid } from "luminary-shared";

/**
 * Tracks article reading progress for the "Continue reading" homepage row.
 *
 * Uses per-block dwell time (scaled by word count and language reading speed),
 * plus scroll velocity gating so users who skim through an article are not
 * recorded as having read it.
 */

const BLOCK_SELECTOR = "p, h1, h2, h3, h4, li, blockquote, pre";

/** Block must be at least this fraction visible within the scroll root. */
export const READING_INTERSECTION_RATIO = 0.5;

/** Above this scroll speed (px/s), dwell timers are paused — user is skimming. */
export const READING_MAX_SCROLL_VELOCITY_PX_S = 1200;

/** Ignore velocity samples shorter than this (trackpad / layout jitter). */
export const READING_MIN_SCROLL_SAMPLE_MS = 50;

/** Suppress velocity sampling and dwell while restoreScrollPosition runs. */
export const READING_RESTORE_GUARD_MS = 400;

export function computeScrollVelocity(deltaY: number, deltaMs: number): number {
    if (deltaMs < READING_MIN_SCROLL_SAMPLE_MS) return 0;
    return Math.abs(deltaY) / (deltaMs / 1000);
}

export type ScrollVelocityState = {
    pendingScrollDeltaY: number;
    pendingScrollDeltaMs: number;
    wasScrollingFast: boolean;
};

/** Batch short scroll samples, then decide whether the user is skimming. */
export function applyScrollVelocitySample(
    state: ScrollVelocityState,
    deltaY: number,
    deltaMs: number,
): { isFast: boolean; justSlowedDown: boolean; state: ScrollVelocityState } {
    const next: ScrollVelocityState = {
        pendingScrollDeltaY: state.pendingScrollDeltaY + deltaY,
        pendingScrollDeltaMs: state.pendingScrollDeltaMs + deltaMs,
        wasScrollingFast: state.wasScrollingFast,
    };

    if (next.pendingScrollDeltaMs < READING_MIN_SCROLL_SAMPLE_MS) {
        return { isFast: next.wasScrollingFast, justSlowedDown: false, state: next };
    }

    const velocity = computeScrollVelocity(
        next.pendingScrollDeltaY,
        next.pendingScrollDeltaMs,
    );
    next.pendingScrollDeltaY = 0;
    next.pendingScrollDeltaMs = 0;

    if (velocity > READING_MAX_SCROLL_VELOCITY_PX_S) {
        next.wasScrollingFast = true;
        return { isFast: true, justSlowedDown: false, state: next };
    }

    const justSlowedDown = next.wasScrollingFast;
    next.wasScrollingFast = false;
    return { isFast: false, justSlowedDown, state: next };
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

function isElementVisibleInRoot(
    el: Element,
    root: HTMLElement | Window,
    intersectionRatio = READING_INTERSECTION_RATIO,
): boolean {
    const elRect = el.getBoundingClientRect();
    if (elRect.height <= 0) return false;

    const rootRect =
        root === window
            ? { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }
            : (root as HTMLElement).getBoundingClientRect();

    const visibleHeight =
        Math.min(elRect.bottom, rootRect.bottom) - Math.max(elRect.top, rootRect.top);
    return visibleHeight / elRect.height >= intersectionRatio;
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
    const dwellAccumulatedMs = new Map<MaybeElement, number>();
    let lastSavedProgress = -1;
    let lastScrollY = 0;
    let lastScrollTime = 0;
    let scrollVelocityState: ScrollVelocityState = {
        pendingScrollDeltaY: 0,
        pendingScrollDeltaMs: 0,
        wasScrollingFast: false,
    };
    let scrollRafPending = false;
    let dwellRafId: number | null = null;
    let lastDwellFrameTime = 0;
    let trackedContentId: Uuid | undefined;

    const isRestoring = ref(false);

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
        confirmedBlocks.clear();
        visibleBlocks.clear();
        lastSavedProgress = -1;
        lastScrollY = 0;
        lastScrollTime = 0;
        scrollVelocityState = {
            pendingScrollDeltaY: 0,
            pendingScrollDeltaMs: 0,
            wasScrollingFast: false,
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

    function tickDwell(timestamp: number) {
        dwellRafId = requestAnimationFrame(tickDwell);

        if (!options.enabled.value || isRestoring.value || scrollVelocityState.wasScrollingFast) {
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

        for (const el of visibleBlocks) {
            if (!el || confirmedBlocks.has(el)) continue;

            const requiredMs = blockDwellMs(el);
            const accumulated = (dwellAccumulatedMs.get(el) ?? 0) + elapsed;

            if (accumulated >= requiredMs) {
                dwellAccumulatedMs.delete(el);
                markBlockRead(el);
            } else {
                dwellAccumulatedMs.set(el, accumulated);
            }
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

    function startDwellIfEligible(el: MaybeElement) {
        if (!el || confirmedBlocks.has(el)) return;
        if (!visibleBlocks.has(el) || isRestoring.value || scrollVelocityState.wasScrollingFast) return;
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

    function onFastScrollDetected() {
        clearDwellAccumulation();
        scrollVelocityState.wasScrollingFast = true;
    }

    function onScroll() {
        if (!options.enabled.value || isRestoring.value) return;

        const container = options.scrollContainer.value;
        const scrollY = getScrollTop(container);
        const now = performance.now();

        if (lastScrollTime > 0) {
            const { isFast, justSlowedDown, state } = applyScrollVelocitySample(
                scrollVelocityState,
                scrollY - lastScrollY,
                now - lastScrollTime,
            );
            scrollVelocityState = state;

            if (isFast) {
                onFastScrollDetected();
            } else if (justSlowedDown) {
                if (!scrollRafPending) {
                    scrollRafPending = true;
                    requestAnimationFrame(() => {
                        scrollRafPending = false;
                        ensureDwellLoop();
                    });
                }
            }
        }

        lastScrollY = scrollY;
        lastScrollTime = now;
    }

    function handleIntersection(entries: IntersectionObserverEntry[]) {
        for (const entry of entries) {
            const el = entry.target as MaybeElement;
            const visible =
                entry.isIntersecting && entry.intersectionRatio >= READING_INTERSECTION_RATIO;

            if (visible) {
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
                scrollVelocityState = {
                    pendingScrollDeltaY: 0,
                    pendingScrollDeltaMs: 0,
                    wasScrollingFast: false,
                };
                lastScrollY = getScrollTop(container);
            }, READING_RESTORE_GUARD_MS);
        }, 300);
    }

    function setup(contentChanged: boolean) {
        collectBlocks();

        if (!options.enabled.value || blocks.value.length === 0) return;

        if (contentChanged) {
            seedConfirmedFromSavedProgress();
            restoreScrollPosition();
        }
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

    return { blocks, restoreScrollPosition, setup };
}
