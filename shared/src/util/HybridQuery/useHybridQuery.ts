import type { ShallowRef } from "vue";
import type { BaseDocumentDto } from "../../types";
import type { MangoQuery } from "../MangoQuery/MangoTypes";
import { HybridQuery, type HybridQueryOptions } from "./HybridQuery";

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
 */
export function useHybridQuery<T extends BaseDocumentDto = BaseDocumentDto>(
    query: MangoQuery | (() => MangoQuery),
    options?: HybridQueryOptions,
): ShallowRef<T[]> {
    return new HybridQuery<T>(query, options).output;
}
