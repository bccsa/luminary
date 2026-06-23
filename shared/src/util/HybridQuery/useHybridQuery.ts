import type { ComputedRef, ShallowRef } from "vue";
import type { BaseDocumentDto, Uuid } from "../../types";
import type { MangoQuery } from "../MangoQuery/MangoTypes";
import { HybridQuery, type HybridQueryOptions } from "./HybridQuery";

/**
 * The reactive bundle returned by {@link useHybridQueryWithState}:
 * - `output` — the live result window (same ref {@link useHybridQuery} returns).
 * - `isFetching` — `true` until the query's first COMPLETE result settles (the local
 *   read AND, where applicable, the remote supplement). Stays `true` while the remote
 *   leg is in flight even after local data has painted; goes `false` once everything
 *   has settled (or, offline, once the fetch is parked on the reconnect watcher). A
 *   query rebuild (reactive thunk / live) re-enters loading. Use it to gate a spinner
 *   or to tell "still fetching" from "fetched, genuinely empty".
 * - `error` — the last routing/remote/local-read error, or `undefined`; cleared on
 *   every rebuild. A partial multi-query failure (some results returned) does not set it.
 * - `hasLocalChanges` — a reactive queryable `(id) => boolean` reporting whether a document
 *   has a change queued locally but not yet acknowledged by the server. Independent of this
 *   query's result window (it reflects the global outgoing-change queue), so a non-editable
 *   overview can flag the pending-offline state of each row it renders.
 */
export type UseHybridQueryState<T extends BaseDocumentDto> = {
    output: ShallowRef<T[]>;
    isFetching: ComputedRef<boolean>;
    error: ShallowRef<unknown | undefined>;
    hasLocalChanges: ComputedRef<(id: Uuid) => boolean>;
};

/**
 * Composable wrapper around {@link HybridQuery}: it constructs the class and
 * returns **only** its `output` ref, so a component can bind to the reactive
 * result without holding (or disposing) the instance itself.
 *
 * ```ts
 * const items = useHybridQuery<ContentDto>(query, { live: true });
 * // template: <div v-for="d in items" :key="d._id">…</div>
 * ```
 *
 * **Lifecycle.** `HybridQuery` registers `onScopeDispose(() => this.dispose())`
 * in its constructor, and this composable is a plain synchronous call, so the
 * instance is owned by the **caller's effect scope**. Call it synchronously in
 * `setup` / `<script setup>` (or after a top-level `await` — Vue's
 * `withAsyncContext` keeps the scope valid) and it tears down automatically on
 * unmount: the Dexie live-query subscription, the socket listener, and the
 * reconnect watcher all stop. Same contract as `useDexieLiveQuery`.
 *
 * **Reactive queries (dependency tracking).** A `() => MangoQuery` thunk is
 * reactive — read `myRef.value` directly inside it and the query rebuilds when a
 * ref it reads changes. This is **independent of `live`** (which controls
 * continuous liveness):
 *
 * | query form | `live: false` (one-shot) | `live: true` |
 * | --- | --- | --- |
 * | static `MangoQuery` | read once | live Dexie + socket; **query fixed** |
 * | `() => MangoQuery` thunk | **re-query on each dep change** (snapshot) | live **+ dependency tracking** |
 *
 * ```ts
 * const items = useHybridQuery<ContentDto>(
 *     () => ({ selector: { parentTags: { $elemMatch: { $in: pinnedCats.value } } } }),
 *     { live: true },   // rebuilds whenever pinnedCats changes
 * );
 * ```
 *
 * The refs the thunk reads are auto-tracked (no `deps` array); the thunk must be
 * **pure** (called more than once per change). See the README for the full
 * contract and caveats (output-on-change, debouncing, …).
 *
 * **Performance / offline options.** `{ cache: true }` seeds `output` from a
 * localStorage window for an instant first paint; `{ persistOffline: true }` writes
 * the supplement's syncable docs to IndexedDB so the tiles are openable offline
 * (retention-managed; PII never persisted). They are independent and composable —
 * see {@link HybridQueryOptions} and the README. When two cached queries share a
 * structural shape and must not collide, give each a distinct `{ cacheId }`.
 *
 * **Caveats:**
 * - **Setup-only.** Called outside an effect scope (event handler, `.then`,
 *   module top-level) it will NOT auto-dispose — there is no `dispose()` handle
 *   on the return value, so such callers should use the {@link HybridQuery} class
 *   directly and call `dispose()` themselves.
 * - **`<KeepAlive>`.** Disposal fires on real unmount, not on deactivation, so a
 *   cached/"recycled" page keeps its instance (and socket listener) alive in the
 *   background until the cache evicts it.
 *
 * **Loading / error state.** This composable returns ONLY `output`. To also drive a
 * spinner or distinguish "still fetching" from "fetched, genuinely empty", use
 * {@link useHybridQueryWithState}, which returns `{ output, isFetching, error }` for the
 * same instance (same lifecycle, same options).
 */
export function useHybridQuery<T extends BaseDocumentDto = BaseDocumentDto>(
    query: MangoQuery | (() => MangoQuery),
    options?: HybridQueryOptions,
): ShallowRef<T[]> {
    return useHybridQueryWithState<T>(query, options).output;
}

/**
 * Like {@link useHybridQuery}, but returns the full reactive bundle
 * `{ output, isFetching, error, hasLocalChanges }` ({@link UseHybridQueryState}) instead of
 * only the `output` ref. Same `(query, options)` signature, same lifecycle (auto-disposes on
 * the caller's effect scope), and the same reactive-query / caching / offline semantics.
 * `hasLocalChanges` is a queryable `(id) => boolean` for the pending-offline state of any doc
 * (see {@link UseHybridQueryState}) — handy for a non-editable overview.
 *
 * ```ts
 * const { output, isFetching, error } = useHybridQueryWithState<ContentDto>(query);
 * // template: <Spinner v-if="isFetching" />
 * //           <Empty v-else-if="!output.length" />
 * ```
 *
 * See {@link UseHybridQueryState} for the exact `isFetching` / `error` semantics.
 */
export function useHybridQueryWithState<T extends BaseDocumentDto = BaseDocumentDto>(
    query: MangoQuery | (() => MangoQuery),
    options?: HybridQueryOptions,
): UseHybridQueryState<T> {
    const q = new HybridQuery<T>(query, options);
    return {
        output: q.output,
        isFetching: q.isFetching,
        error: q.error,
        hasLocalChanges: q.hasLocalChanges,
    };
}
