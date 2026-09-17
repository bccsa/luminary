/** Reactive and imperative reads of a doc type's syncList membership. */
import { computed, type ComputedRef } from "vue";
import { DocType } from "../../types";
import { syncList } from "../../api/sync/state";
import { splitChunkTypeString } from "../../api/sync/utils";

/**
 * True iff at least one syncList entry currently tracks the given doc type
 * (regardless of subType / memberOf / language). Used by the non-content branch:
 * synced types are served from Dexie only; not-in-syncList types are fetched from
 * the API only.
 */
export function typeIsInSyncList(type: DocType | undefined): boolean {
    if (type === undefined) return false;
    for (const entry of syncList.value) {
        if (splitChunkTypeString(entry.chunkType).type === type) return true;
    }
    return false;
}

const _membershipRefs = new Map<DocType, ComputedRef<boolean>>();

/**
 * Per-`DocType`-memoized reactive twin of {@link typeIsInSyncList}: "does at least one
 * syncList entry currently track `type`?", as a `ComputedRef<boolean>`. It delegates to
 * `typeIsInSyncList`, so the reactive and imperative reads share ONE predicate and can't
 * diverge.
 *
 * The point is to watch the derived BOOLEAN, not `syncList` itself: `syncList` mutates on
 * every sync chunk (block ranges, eof, new columns), but membership for a given type flips
 * `false→true` exactly once (when its first column registers) and stays true — so a
 * `watch` on this ref fires once per genuine flip, not per chunk. The `computed` caches, so
 * the `syncList` scan runs once globally per syncList change per type, regardless of how
 * many `HybridQuery` instances depend on it.
 *
 * Module-level `computed` (no owning effect scope) is intentional: it lives for the module
 * lifetime, exactly like `syncList`; there is at most one entry per `DocType` (a handful).
 * Returns the SAME ref for a given type on every call.
 */
export function typeInSyncListRef(type: DocType): ComputedRef<boolean> {
    let r = _membershipRefs.get(type);
    if (!r) {
        r = computed(() => typeIsInSyncList(type));
        _membershipRefs.set(type, r);
    }
    return r;
}
