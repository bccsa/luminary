/** Public option shape, shared internally without importing the Vue facade. */
export type HybridQueryOptions = {
    /**
     * When `true`, the local Dexie source is read **live** — the class subscribes
     * via `useDexieLiveQuery` and re-emits `output` on every IndexedDB change,
     * re-running the same dedup + sort/limit. When `false` (the default) the local
     * source is read **once** (the original one-shot behaviour).
     *
     * The API supplement **POST** is **always one-shot** regardless of this flag
     * (decided once from the first local result). In live mode the remote
     * contribution is additionally kept live by a Socket.io listener; on reconnect
     * that listener re-attaches but the supplement is **not** re-fetched (offline
     * gaps heal on remount). See the module README for the shortcomings.
     *
     * **`live` is independent of dependency tracking.** A `() => MangoQuery` thunk
     * is reactive in *both* modes — it rebuilds whenever a ref it reads changes;
     * `live` only controls whether each rebuild reads Dexie continuously (liveQuery
     * + socket) or one-shot. See the class docs for the full matrix.
     */
    live?: boolean;

    /**
     * When set, the query is **pageable**: `loadMore()` grows the window by this many
     * rows without rebuilding, so the existing documents, the Dexie subscription, the
     * socket listener and the joined rooms all survive an append. Off by default, in
     * which case `loadMore()` is inert and `hasMore` is always `false`.
     *
     * The query's own `$limit` is the first page — a pageable query must have one.
     * Growing `$limit` in the query thunk instead restarts the query from scratch:
     * every document is re-read, the subscriptions are torn down and re-established,
     * and `isFetching` re-enters its initial-load state. Prefer this option for any
     * "load more" / infinite-scroll list.
     *
     * A genuine query change (a filter, a sort, a mutated id set) still rebuilds and
     * returns the window to the first page, which is what a re-filtered list wants.
     */
    pageSize?: number;

    /**
     * When `true`, **response caching** is on: each (re)build seeds the local +
     * remote contributions synchronously from the last persisted window for this
     * query's *shape* (so a remount paints the merged result instantly, before the
     * local read resolves — and without collapsing to local-only while the API
     * supplement is in flight), and every visible change is persisted back. Off by
     * default.
     *
     * The cache key is a **structural fingerprint** — runtime values (language /
     * pinned id lists, …) are stripped, so queries that differ only in their values
     * share one entry, keeping the key space small (no eviction needed). Persisted
     * to `localStorage` (synchronous read, no IndexedDB contention). The seed is a
     * first-paint accelerant only: live/remote data always supersedes it, and
     * `sameWindow` skips the re-render when the fresh result matches the seed.
     *
     * Caveat: two different call sites with an identical query *shape* but a
     * different constant collide on one entry — harmless beyond a first-paint flash
     * that self-corrects. When the collision IS harmful (two simultaneously-mounted
     * feeds that differ only by a stripped constant), pass {@link cacheId} to give
     * them distinct entries. See {@link structuralCacheKey}.
     */
    cache?: boolean;

    /**
     * Optional discriminator folded into the response-cache fingerprint. Only
     * meaningful with `cache: true`. The cache key is a structural fingerprint that
     * strips runtime values, so two call sites whose queries differ only by a
     * stripped constant (e.g. a `$ne` enum, an id list) share one entry. That is
     * usually fine (a self-correcting first-paint flash), but for two feeds mounted
     * at the same time it means they seed from each other. Pass a stable, unique
     * `cacheId` per such call site to separate their fingerprints. No effect when
     * `cache` is off.
     */
    cacheId?: string;

    /**
     * Field names omitted from each doc before it is persisted to the response
     * cache. The seed aims to hold the FULL settled window (so first paint matches
     * the live result, with no grow-in); stripping heavy fields (e.g. `fts`,
     * `ftsTokenCount`, `text`) keeps that within `localStorage`'s budget.
     *
     * Only safe for fields the initial rendered output does not need. When an
     * authoritative source replaces the seed, publication is forced even if IDs
     * and update timestamps match, so restored fields reach the caller.
     * Defaults to `[]` (strip nothing). No effect when `cache` is off.
     */
    cacheStripFields?: string[];

    /**
     * Field names dropped from every doc **as it is ingested** into the query's
     * `_local` / `_remote` contributions — from the local read, the API supplement,
     * socket upserts, and the cache seed alike — so they never reach the live
     * `output` array. Defaults to `[]` (strip nothing).
     *
     * **Purpose — reduce the in-memory (JS heap) footprint.** A live query holds its
     * entire result window resident in `output` for as long as the consumer is
     * mounted, and a `live` query re-materialises it on every change. When a doc type
     * carries heavy fields the consumer never reads off a *result* doc — a full text
     * / HTML body, a serialized search index, a large translations/strings map, a
     * revision token — those fields can dominate the retained size of a big window.
     * Listing them here keeps them out of the heap entirely: each doc is shallow-
     * copied without them at ingest, so the originals are freed and only the slim
     * copies are retained. The win scales with window size and field weight; for a
     * doc whose listed fields are absent the copy is skipped, so a no-op costs
     * nothing. Strip only fields the rendered output genuinely does not read — a
     * stripped field is simply not present on `output` docs.
     *
     * **Relationship to the cache.** Because stripped docs are what `output` holds,
     * they are also what the response cache persists — so `stripFields` shrinks the
     * cache footprint too. {@link cacheStripFields} is the narrower tool: it removes
     * *additional* fields from the cache **only**, leaving them in `output`.
     *
     * **Safety.** The merge / sort / dedup / live-update machinery reads only `_id`
     * and `updatedTimeUtc`, so stripping any other field is correctness-neutral —
     * but never strip those two. {@link persistOffline} is unaffected: the full,
     * unstripped docs are written to IndexedDB before the strip is applied, so an
     * offline read still sees every field.
     */
    stripFields?: string[];

    /**
     * When `true`, **offline document persistence** is on: the API supplement's
     * older-tail docs are written to IndexedDB (via `db.bulkPut`) so a tile backed by
     * them is openable offline (e.g. a detail view reads `db.docs` by slug). Off by
     * default.
     *
     * Distinct from {@link cache} (which keeps a localStorage *window* for first
     * paint): this persists the *documents* themselves, durably. The two compose.
     *
     * Privacy / scope: only fetched **Content** is written (the type check is the floor) — the API
     * has already permission-scoped what it returned, and a non-content type (e.g. the CMS's `user`)
     * persists **nothing**, regardless of this flag. Deliberately NOT gated on `isSyncableDoc`: that
     * needs a populated `syncList` content entry, which sync only creates after fetching a content
     * doc — so when everything is below the sync cutoff (nothing to sync) it would persist nothing.
     * Persisted docs are retention-managed and evicted once stale (see `db/retention.ts`).
     */
    persistOffline?: boolean;

    /**
     * When `true`, `output` **survives a query rebuild** (a reactive thunk dep change, a
     * syncList membership flip): the previous window stands in for the incoming one, so a
     * list that is merely re-narrowed — a changed filter, a grown `$limit`, a mutated id
     * set — does not blank while its new result loads. Off by default.
     *
     * Leave it off whenever the query resolves an IDENTITY rather than narrowing a list —
     * a lookup by slug or id, or a parent's children — where the previous result is a
     * different entity and showing it is wrong rather than merely stale. The distinction
     * cannot be made from the selector (both cases look like "the kept docs no longer
     * match"), so it is the call site's to declare.
     *
     * A provably-empty new query clears `output` either way.
     */
    keepPreviousResult?: boolean;
};
