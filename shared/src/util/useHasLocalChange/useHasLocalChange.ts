import { computed, effectScope, type ComputedRef, type ShallowRef } from "vue";
import { db } from "../../db/database";
import type { Uuid } from "../../types";
import { useDexieLiveQuery } from "../useDexieLiveQuery";

// One shared live query over the outgoing `localChanges` queue's docIds. The `localChanges`
// table is small and shared, and `orderBy("docId").keys()` is index-only (no doc reads); it
// re-emits on every queue insert (`db.upsert`) and delete (`db.applyLocalChangeAck`), which is
// what drives the `hasLocalChanges` checks below to re-evaluate.
//
// Memoized in a detached scope so every caller shares ONE subscription instead of opening its
// own (e.g. every row in a list, or every reactive query). The scope is never disposed — this
// is a process-wide singleton by design.
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
 * Reactive queryable: a function `(id) => boolean` reporting whether a document has a
 * queued-but-unacknowledged local (offline) change — i.e. it was saved locally (`db.upsert`)
 * but the server has not yet acknowledged it. Backed by a single shared subscription to the
 * outgoing change queue, so checking many ids costs one live query.
 *
 * @returns a computed accessor; call `accessor.value(id)` to test a given document id.
 */
export function useHasLocalChanges(): ComputedRef<(id: Uuid) => boolean> {
    const ids = localChangeIds();
    return computed(() => {
        const set = new Set(ids.value);
        return (id: Uuid) => set.has(id);
    });
}
