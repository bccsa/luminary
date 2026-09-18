import { ref, watch } from "vue";
import { syncActive } from "luminary-shared";
import { appSyncedLanguageIdsAsRef } from "./globalConfig";

/**
 * Whether an empty read of the local document store means "there is nothing" rather than "sync
 * hasn't delivered it yet". Passed to `init()` as `localCorpusSettled`, where `HybridQuery` uses it
 * to decide when a response-cache seed may be retired — a prerendered page's tiles would otherwise
 * be wiped by the first (empty) IndexedDB read of a first-time visitor and reappear a moment later.
 */
export const localCorpusSettled = ref(false);

/**
 * Safety net for a content sync pass that starts but never reports completion (a stalled or
 * errored runner leaves `syncActive` stuck true). Without it the seed is held for the session,
 * which also suppresses local deletions in every seeded query. Generous on purpose: latching
 * early re-introduces the very flash this ref exists to prevent.
 */
const SYNC_SETTLE_FALLBACK_MS = 60_000;

/**
 * Latch it once a sync pass that covered content has run to completion. `syncActive` alone can't
 * answer this: it is false both before the first pass starts and after it ends, and on a cold start
 * the feeds query IndexedDB well before sync begins. It stays latched for the session — later
 * passes bring updates to an already-usable store, and reopening the window would let a feed that
 * has legitimately become empty show stale tiles again.
 *
 * The synced-language check mirrors the gate in `initSync`, which skips content entirely while no
 * language is selected for sync. A pass that ran in that window carried languages and auth
 * providers only, so it says nothing about whether the content corpus is complete.
 *
 * A client that never connects never latches, so an offline first visit keeps showing the
 * prerendered tiles. That is the best data available to it; the alternative is a blank feed.
 */
export function initSyncReadiness(): void {
    if (localCorpusSettled.value) return;
    let sawContentSyncRun = false;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    // Starts as a no-op so `latch` can call it from the watcher's immediate run, which fires
    // before `watch` has returned the real one. The trailing `if (latched)` covers that case.
    let stop: () => void = () => {};
    let latched = false;

    const latch = () => {
        latched = true;
        localCorpusSettled.value = true;
        if (fallback) clearTimeout(fallback);
        stop();
    };

    stop = watch(
        syncActive,
        (active) => {
            if (active) {
                if (appSyncedLanguageIdsAsRef.value.length) {
                    sawContentSyncRun = true;
                    fallback ??= setTimeout(latch, SYNC_SETTLE_FALLBACK_MS);
                }
                return;
            }
            if (!sawContentSyncRun) return;
            latch();
        },
        { immediate: true },
    );
    if (latched) stop();
}
