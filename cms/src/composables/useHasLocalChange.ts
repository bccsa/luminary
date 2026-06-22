import { computed, effectScope, type ComputedRef, type ShallowRef } from "vue";
import { db, useDexieLiveQuery, type Uuid } from "luminary-shared";

// One shared live query over the outgoing `localChanges` queue's docIds — the same mechanism
// `toEditable` uses internally (`orderBy("docId").keys()` is index-only, re-emits on every queue
// insert/ack). Memoized in a detached scope so every consumer shares ONE subscription instead of
// opening its own (the deprecated `db.isLocalChangeAsRef` created one live query per call).
let _ids: ShallowRef<Uuid[]> | undefined;
function localChangeIds(): ShallowRef<Uuid[]> {
    if (!_ids) {
        const scope = effectScope(true);
        _ids = scope.run(() =>
            useDexieLiveQuery(() => db.localChanges.orderBy("docId").keys() as Promise<Uuid[]>, {
                initialValue: [] as Uuid[],
            }),
        ) as ShallowRef<Uuid[]>;
    }
    return _ids;
}

/**
 * Reactive: does this document have a queued-but-unacknowledged local (offline) change? Replaces
 * the deprecated `db.isLocalChangeAsRef(id)` and shares a single `localChanges` subscription across
 * all callers (e.g. every row in a list), rather than one per component.
 */
export function useHasLocalChange(docId: Uuid): ComputedRef<boolean> {
    const ids = localChangeIds();
    return computed(() => ids.value.includes(docId));
}
