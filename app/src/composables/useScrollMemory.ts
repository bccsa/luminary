import { onActivated, onBeforeUnmount, onDeactivated, onMounted, watch, type Ref } from "vue";
import { useRoute } from "vue-router";
import { localCacheVersion } from "@/globalConfig";

const RESTORE_RETRY_MS = 50;
// Longest a restore waits for the position to become reachable; the page stays hidden meanwhile.
const RESTORE_MAX_MS = 200;

// In-memory on purpose: positions only matter within one session of navigating around.
const positions = new Map<string, number>();

// Set by the router on back/forward only, so a fresh link click starts at the top.
let historyNavigation = false;

export function markHistoryNavigation(isHistory: boolean) {
    historyNavigation = isHistory;
}

// How many items an infinite list had revealed, per route: without it a recreated page is too
// short to scroll back to where the reader was.
const revealedCounts = new Map<string, number>();

watch(localCacheVersion, () => {
    positions.clear();
    revealedCounts.clear();
});

/**
 * Remembers how many items of an infinite list the reader had revealed on this route.
 * `saved` is 0 unless the page is reached by back/forward, like the scroll position.
 */
export function useRevealedCount() {
    // Optional: component specs mount lists without a router installed.
    const key = useRoute()?.fullPath ?? "";
    return {
        saved: historyNavigation ? (revealedCounts.get(key) ?? 0) : 0,
        save: (count: number) => revealedCounts.set(key, count),
    };
}

/**
 * Remembers the scroll position of a page's scroller per route and restores it when the user
 * comes back. A cached (KeepAlive) page loses its scrollTop when its DOM is detached, and a
 * recreated page starts at 0, so neither keeps its place on its own.
 */
export function useScrollMemory(scroller: Ref<HTMLElement | undefined>) {
    const route = useRoute();

    // Optional: component specs mount pages without a router installed.
    let key = route?.fullPath ?? "";
    let lastTop = 0;
    let restoring = false;
    let wasDeactivated = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let giveUpTimer: ReturnType<typeof setTimeout> | undefined;

    const remember = () => positions.set(key, lastTop);

    const onScroll = () => {
        // A programmatic restore that the content is still too short for would otherwise save the clamped value.
        if (restoring || !scroller.value) return;
        lastTop = scroller.value.scrollTop;
        remember();
    };

    const stopRestoring = () => {
        restoring = false;
        clearTimeout(retryTimer);
        clearTimeout(giveUpTimer);
        scroller.value?.style.removeProperty("visibility");
        scroller.value?.removeEventListener("wheel", onWheel);
        scroller.value?.removeEventListener("touchstart", stopRestoring);
    };

    // The inertia of a horizontal trackpad swipe (browser back/forward) lands on the new page; it isn't the reader scrolling.
    const onWheel = (e: WheelEvent) => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        stopRestoring();
    };

    // Content arrives from IndexedDB after mount, so retry until the page is tall enough.
    const restore = (attempt = 0) => {
        const el = scroller.value;
        const target = positions.get(key) ?? 0;
        if (!el || target <= 0) return;

        if (attempt === 0) {
            stopRestoring();
            restoring = true;
            // Hidden while restoring (layout is kept, so scrollTop still applies) to avoid flashing the page at the top first.
            el.style.visibility = "hidden";
            // Past this the reader may already be scrolling by keyboard or scrollbar, which a late retry would fight.
            giveUpTimer = setTimeout(stopRestoring, RESTORE_MAX_MS);
            el.addEventListener("wheel", onWheel, { passive: true });
            el.addEventListener("touchstart", stopRestoring, { passive: true, once: true });
        }

        el.scrollTop = target;
        if (Math.abs(el.scrollTop - target) <= 1) {
            lastTop = el.scrollTop;
            stopRestoring();
            return;
        }
        retryTimer = setTimeout(() => restore(attempt + 1), RESTORE_RETRY_MS);
    };

    onMounted(() => {
        scroller.value?.addEventListener("scroll", onScroll, { passive: true });
        if (historyNavigation) restore();
    });

    onDeactivated(() => {
        wasDeactivated = true;
        stopRestoring();
        // The detached DOM already reports scrollTop 0, so save what the scroll events recorded.
        remember();
    });

    onActivated(() => {
        // Activation also fires right after the first mount, which onMounted already handled.
        if (!wasDeactivated) return;
        wasDeactivated = false;
        lastTop = 0;
        key = route?.fullPath ?? "";
        restore();
    });

    onBeforeUnmount(() => {
        stopRestoring();
        scroller.value?.removeEventListener("scroll", onScroll);
    });
}
