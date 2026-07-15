import { ref, watch, onMounted, onBeforeUnmount, nextTick, type Ref } from "vue";
import { useIntersectionObserver } from "@vueuse/core";
import type { Uuid } from "luminary-shared";

export type ImpressionTrackedDoc = { _id: Uuid; parentTags?: Uuid[] };

export type UseImpressionTrackingOptions = {
    /** How long the container must have stayed visible before an unclicked tile counts as
     *  "scrolled past" rather than "still being read". Evaluated at container-exit (scrolled
     *  off-screen, or the calling component unmounts on navigation) rather than a wall-clock
     *  timer, so a deliberate click made after a long, genuine read is never penalized — only
     *  a timer racing the click could double-count that case. Defaults to 6000ms. */
    dwellMs?: number;
    /** Selector, relative to `root`, for the scrollable element whose children are the
     *  individually-observed tiles. Defaults to `[data-content-tile-scroll]`. */
    scrollSelector?: string;
    /** Called with the unique tag ids across every tile that was genuinely visible for at
     *  least `dwellMs` and never clicked. One call per batch — a tag shared by many tiles
     *  (typically the caller's highest-affinity tag, since that's what selected them) takes
     *  one penalty per batch instead of one per tile. */
    onMiss: (tagIds: Uuid[]) => void;
};

/**
 * Generic per-tile visibility tracking for any tile collection that renders
 * `data-content-id` on each tile within a `data-content-tile-scroll` container. Tracks
 * which tiles were actually scrolled into view for a meaningful dwell period and were
 * never clicked, and reports their tag ids via `onMiss` so a caller can apply negative
 * affinity signal — without penalizing tiles the user never saw.
 */
export function useImpressionTracking(
    docs: Ref<ImpressionTrackedDoc[]>,
    options: UseImpressionTrackingOptions,
) {
    const { dwellMs = 6000, scrollSelector = "[data-content-tile-scroll]", onMiss } = options;

    const root = ref<HTMLElement | null>(null);
    let visibleSince: number | undefined;
    // contentId -> its tag ids, but only after that tile was actually at least half-visible
    // within the scroll container.
    let pending = new Map<Uuid, Uuid[]>();
    let docTags = new Map<Uuid, Uuid[]>();
    let tileObserver: IntersectionObserver | undefined;
    let tilesMutationObserver: MutationObserver | undefined;
    let tileObserverRunSeq = 0;

    function penalizePending() {
        const tagIds = new Set<Uuid>();
        for (const tags of pending.values()) for (const tag of tags) tagIds.add(tag);
        pending = new Map();
        if (tagIds.size > 0) onMiss([...tagIds]);
    }

    // Only penalize tiles that were genuinely scrolled past for at least dwellMs — a
    // container glimpsed for a second on the way to something else shouldn't count.
    function maybePenalizeOnExit() {
        if (visibleSince !== undefined && Date.now() - visibleSince >= dwellMs) {
            penalizePending();
        }
        visibleSince = undefined;
    }

    // Clicking a tile is a deliberate choice regardless of how long the user dwelled first —
    // it must never also count as "scrolled past". Capture the click before RouterLink
    // navigates and drop that tile from the pending set so exit/unmount can't penalize it.
    function onContainerClick(event: MouseEvent) {
        const target = (event.target as HTMLElement).closest<HTMLElement>("[data-content-id]");
        if (target?.dataset.contentId) pending.delete(target.dataset.contentId);
    }

    function observeTiles() {
        const scrollRoot = root.value?.querySelector<HTMLElement>(scrollSelector);
        if (!scrollRoot) return;

        tileObserver?.disconnect();
        tileObserver = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    const contentId = (entry.target as HTMLElement).dataset.contentId as
                        | Uuid
                        | undefined;
                    if (!contentId) continue;
                    const tags = docTags.get(contentId);
                    if (tags) pending.set(contentId, tags);
                }
            },
            { root: scrollRoot, threshold: 0.5 },
        );
        for (const tile of scrollRoot.querySelectorAll<HTMLElement>("[data-content-id]")) {
            tileObserver.observe(tile);
        }

        // Covers lazily-rendered/virtualized tiles that mount after the initial observe pass.
        tilesMutationObserver?.disconnect();
        tilesMutationObserver = new MutationObserver(() => {
            for (const tile of scrollRoot.querySelectorAll<HTMLElement>("[data-content-id]")) {
                tileObserver?.observe(tile);
            }
        });
        tilesMutationObserver.observe(scrollRoot, { childList: true, subtree: true });
    }

    const { stop } = useIntersectionObserver(
        root,
        ([entry]) => {
            if (entry?.isIntersecting) {
                visibleSince = Date.now();
            } else {
                maybePenalizeOnExit();
            }
        },
        { threshold: 0.5 },
    );

    // A fresh batch of docs (e.g. after a profile update) resets tracking — only content
    // actually shown to the user for the dwell window should be penalized.
    watch(
        docs,
        (current) => {
            pending = new Map();
            docTags = new Map(current.map((d) => [d._id, d.parentTags ?? []]));
            const runSeq = ++tileObserverRunSeq;
            void nextTick(() => {
                if (runSeq === tileObserverRunSeq) observeTiles();
            });
        },
        { immediate: true },
    );

    onMounted(() => observeTiles());

    onBeforeUnmount(() => {
        // Covers navigation away (route change) while the container is still on screen —
        // the intersection observer never fires an exit in that case.
        maybePenalizeOnExit();
        stop();
        tileObserver?.disconnect();
        tilesMutationObserver?.disconnect();
    });

    return { root, onContainerClick };
}
