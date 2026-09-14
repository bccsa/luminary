import { ref, watch } from "vue";
import { syncActive } from "luminary-shared";

/**
 * Whether an empty read of the local document store means "there is nothing" rather than "sync
 * hasn't delivered it yet". Passed to `init()` as `localCorpusSettled`, where `HybridQuery` uses it
 * to decide when a response-cache seed may be retired — a prerendered page's tiles would otherwise
 * be wiped by the first (empty) IndexedDB read of a first-time visitor and reappear a moment later.
 */
export const localCorpusSettled = ref(false);

/**
 * Latch it once a sync pass has run to completion. `syncActive` alone can't answer this: it is
 * false both before the first pass starts and after it ends, and on a cold start the feeds query
 * IndexedDB well before sync begins. It stays latched for the session — later passes bring updates
 * to an already-usable store, and reopening the window would let a feed that has legitimately
 * become empty show stale tiles again.
 *
 * A client that never connects never latches, so an offline first visit keeps showing the
 * prerendered tiles. That is the best data available to it; the alternative is a blank feed.
 */
export function initSyncReadiness(): void {
    if (localCorpusSettled.value) return;
    let sawSyncRun = false;
    const stop = watch(
        syncActive,
        (active) => {
            if (active) {
                sawSyncRun = true;
                return;
            }
            if (!sawSyncRun) return;
            localCorpusSettled.value = true;
            stop();
        },
        { immediate: true },
    );
}
