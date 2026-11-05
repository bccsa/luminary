import { onActivated, onBeforeUnmount, onDeactivated, onMounted, watch, type Ref } from "vue";
import { useRoute } from "vue-router";
import { localCacheVersion } from "@/globalConfig";

const RESTORE_RETRY_MS = 50;
const RESTORE_MAX_ATTEMPTS = 40;

// In-memory on purpose: positions only matter within one session of navigating around.
const positions = new Map<string, number>();

// Set by the router on back/forward only, so a fresh link click starts at the top.
let historyNavigation = false;

export function markHistoryNavigation(isHistory: boolean) {
    historyNavigation = isHistory;
}

watch(localCacheVersion, () => positions.clear());

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
        scroller.value?.removeEventListener("wheel", stopRestoring);
        scroller.value?.removeEventListener("touchstart", stopRestoring);
    };

    // Content arrives from IndexedDB after mount, so retry until the page is tall enough.
    const restore = (attempt = 0) => {
        const el = scroller.value;
        const target = positions.get(key) ?? 0;
        if (!el || target <= 0) return;

        if (attempt === 0) {
            stopRestoring();
            restoring = true;
            el.addEventListener("wheel", stopRestoring, { passive: true, once: true });
            el.addEventListener("touchstart", stopRestoring, { passive: true, once: true });
        }

        el.scrollTop = target;
        if (Math.abs(el.scrollTop - target) <= 1 || attempt >= RESTORE_MAX_ATTEMPTS) {
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
