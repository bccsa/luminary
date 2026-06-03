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
 * **Caveats:**
 * - **Setup-only.** Called outside an effect scope (event handler, `.then`,
 *   module top-level) it will NOT auto-dispose — there is no `dispose()` handle
 *   on the return value, so such callers should use the {@link HybridQuery} class
 *   directly and call `dispose()` themselves.
 * - **`<KeepAlive>`.** Disposal fires on real unmount, not on deactivation, so a
 *   cached/"recycled" page keeps its instance (and socket listener) alive in the
 *   background until the cache evicts it.
 * - **Static query.** The query is captured once at construction; a changing
 *   query means dispose + reconstruct (reactive `deps` are not wired yet).
 */
export function useHybridQuery<T extends BaseDocumentDto = BaseDocumentDto>(
    query: MangoQuery,
    options?: HybridQueryOptions,
): ShallowRef<T[]> {
    return new HybridQuery<T>(query, options).output;
}
