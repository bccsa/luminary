# HybridQuery

## Overview

`HybridQuery` is a local-first reactive query that merges Dexie (the local
IndexedDB cache) with an API supplement, given a configured **content
`publishDate` cutoff**. One instance per query owns its data, its reconnect
watcher, and its teardown; the consumer binds to a `ShallowRef<T[]>` and Vue's
scope handles cleanup automatically on unmount.

## Core invariant

**The newest content is always present locally.** The sync engine maintains the
head of the timeline in IndexedDB. The API is only ever needed to supply data
that is genuinely not local:

- **older** content (`publishDate <= cutoff`),
- specific **missing ids**, or
- **non-synced** doc types.

Every short-circuit (limit satisfied locally, all requested ids present) and
every `publishDate <= cutoff` clause appended to a remote query is correct
*because of this invariant*. Don't "fix" the `publishDate <= cutoff` clause
on the id-diff path: a requested id missing from Dexie must, by the invariant,
be older than the cutoff.

## Public API

### `class HybridQuery<T>`

```ts
const q = new HybridQuery<ContentDto>({
    selector: {
        $and: [
            { type: DocType.Content },
            { parentPostType: { $ne: PostType.Page } },
            ...mangoIsPublished(appLanguageIds),
        ],
    },
    $sort: [{ publishDate: "desc" }],
    $limit: 10,
    // Pin the CouchDB index — Content selectors are too complex for the
    // mango picker to commit to our partial index on its own. See
    // "Pinning the CouchDB index" below.
    use_index: "content-publishDate-index",
});
// template: <div v-for="d in q.output.value" :key="d._id">…</div>
// q.dispose() runs automatically on component unmount (see "Offline" below).
//
// What actually hits the wire for a Content query is your selector AND an
// auto-appended `publishDate <= cutoff` clause (see "The content cutoff"). So
// the POSTed selector above is effectively:
//   { $and: [
//       { type: DocType.Content },
//       { parentPostType: { $ne: PostType.Page } },
//       ...mangoIsPublished(appLanguageIds),
//       { publishDate: { $lte: <cutoff> } },   // ← auto-appended
//   ] }
// Any CouchDB index a `use_index` value points at MUST therefore cover
// `publishDate` — both because it's now part of the selector and because
// `$sort` is on `publishDate`. See "Pinning the CouchDB index".
```

| Member | Description |
| --- | --- |
| `output: ShallowRef<T[]>` | The reactive merged set. Bind your template to `q.output.value`. In one-shot mode, mutated **once** for the Dexie-only and API-only non-content branches; **twice** for the content branch (local read, then merged remote). In **live mode** it additionally re-emits on every local IndexedDB change (see below). |
| `dispose(): void` | Stop the reconnect watcher and (in live mode) the Dexie live-query subscription. Idempotent. Called automatically when the owning Vue scope disposes. |

### Live mode (opt-in)

```ts
const q = new HybridQuery<ContentDto>(query, { live: true });
```

`HybridQueryOptions = { live?: boolean; cache?: boolean }` is a second constructor
argument (`cache` is covered under "Response caching" below; default `live: false`
— one-shot, the original behaviour). With `live: true`,
the **local Dexie source** is read reactively via `useDexieLiveQuery`: every
IndexedDB change re-runs the query, replaces the local contribution wholesale
(so **local deletions drop out of `output`**), and re-applies the same dedup +
sort/limit. Cross-tab reactivity comes for free (Dexie's `liveQuery` propagates
across tabs).

The **API supplement POST stays one-shot** in both modes — it is decided exactly
once off the *first* local result (gated by an internal `_apiDecided` flag) and
merged into `output`.

Internally the class keeps two contributions — `_local` (the Dexie result,
replaced wholesale on each live emission) and `_remote` (the API supplement) — and
recomputes `output = applySortLimit(mergeById(_local, _remote), $sort, $limit)`
via the private `_recompute`. `_recompute` only reassigns the `output` ref when
the windowed result actually changed (compared by `_id` + `updatedTimeUtc` per
position via `sameWindow`), to avoid needless Vue re-renders.

### Live socket updates (live mode)

In **live mode**, the remote contribution is also kept live. The class attaches a
`getSocket().on("data", …)` listener to the **global access-scoped changefeed**
and filters it client-side with a predicate compiled (`mangoCompile`) from the
**API supplement query**. Matching docs are upserted into `_remote`; `DeleteCmd`s
that pass `db.validateDeleteCommand` + a compiled delete predicate
(`toDeleteSelector`) and target a doc we currently hold (newer than our copy) are
removed — **whether sourced locally or remotely**. Everything feeds the same
`_recompute` (dedup → sort → limit → minimal mutation).

This does *not* reuse the deprecated `ApiLiveQuery`/`applySocketData` path (those
are coupled to the old `/search` `ApiSearchQuery` shape); it is a fresh
`mangoCompile`-based apply over the new `/query` model.

The feed carries **all** changes the user has access to (the server streams the
CouchDB changefeed; it's the *global* client handler in `socketio.ts` that narrows
to `syncList` before writing Dexie), so older-tail / non-synced remote docs **do**
receive live updates.

The listener attaches only when `live: true` **and** there is a supplement query:
the content branch (when `decideContentApiQuery` returns one) and the API-only
branch. The syncList-only branch attaches **no** listener — those docs already
update via the global `bulkPut → Dexie → liveQuery` path.

#### Shortcomings (read before relying on this)

1. **No offline-gap healing.** On socket reconnect the listener only **re-attaches**
   — it does **not** re-fetch the supplement. Changes to `_remote` docs that happen
   **while offline** are **missed**; the view self-corrects only on the next
   **remount** (which re-runs the one-shot supplement). See "Planned future work".
2. **Offline deletes especially.** Even the planned incremental gap-fetch
   (`updatedTimeUtc > lastSeen`) can't surface deletions — `/query` returns live
   docs, not tombstones — so a doc deleted while offline can linger until remount.
3. **Delete-predicate fidelity.** A `DeleteCmd` carries only `docType` + `docId`
   (not the deleted doc's `publishDate`/`parentType`/`language`), so the compiled
   delete predicate is effectively a `docType` (+ id-list) pre-filter. The real
   gate is `db.validateDeleteCommand` + **output membership** + the stale guard
   (`ourCopy.updatedTimeUtc < cmd.updatedTimeUtc`).
4. **Tombstone window.** Between a socket delete and Dexie catching up, a
   short-lived tombstone (per `docId`) suppresses the doc so an unrelated
   `liveQuery` re-emit can't resurrect it; it's released in `_setLocal` once the
   fresh Dexie read no longer holds a stale copy. A copy newer than the delete
   (republish-after-delete) supersedes the tombstone.
5. **`_remote` is not persisted to Dexie by default.** Older-tail docs and socket
   upserts to them live in memory only; a remount re-fetches. Opt into
   `{ persistOffline: true }` to write the supplement to IndexedDB (see "Offline
   document persistence" below) — though socket upserts to the older tail remain
   in-memory only in v1.
6. **Live mode must be disposed.** A non-component caller that forgets `dispose()`
   leaks the Dexie subscription **and** the socket listener.

#### Planned future work

- **Reconnect gap-fetch / offline-gap healing.** The gap is *temporal*: track the
  max `updatedTimeUtc` seen and, on a **debounced** reconnect, fetch only
  `supplementSelector + updatedTimeUtc > lastSeen` (upserts). Offline-delete
  healing needs a "DeleteCmds since lastSeen" query — which is what sync2 already
  does — so this likely belongs as a **sync2 extension**, not a per-instance
  mini-sync.
- **Re-work `applySocketData`** onto `mangoCompile`-from-sync-queries, retiring the
  deprecated `ApiSearchQuery`/`/search` coupling and aligning the codebase on one
  changefeed-filtering approach.

### Response caching (opt-in)

```ts
const q = new HybridQuery<ContentDto>(query, { cache: true });
```

With `{ cache: true }`, `HybridQuery` **seeds its two contributions from the last
persisted window on (re)build, then persists each new window back** — moving the
manual "cached initial value, update when the slow query resolves" pattern the
overview pages hand-roll today into the query layer. Independent of `live`, and
works for both static and thunk queries.

- **Synchronous first paint.** The seed is read from **`localStorage`** (not
  IndexedDB) inside `_run`, *before* any local/remote read for the generation —
  so a remount paints the cached window on the **first frame**, with no race and
  no race-gating. localStorage also avoids contending with sync on IndexedDB,
  which is busiest exactly at startup (when the seed matters most).
- **Seeds the contributions, not `output` — so the seed never collapses.** The
  persisted window is stored **split by source** (`{ local, remote }`): the `local`
  docs seed `_local` and the older-tail `remote` docs seed `_remote`, then a
  `_recompute` paints the merged window. Because the seed flows *through* the normal
  merge pipeline (not laid on top of `output`), the first real Dexie read —
  `_setLocal`, which replaces `_local` wholesale — recomputes against the *still-seeded*
  `_remote`, so the view doesn't shrink to local-only while the API supplement is in
  flight. The seeded remote is superseded when the POST resolves (`_setRemote` drops
  seeded docs the POST didn't re-supply, keeping any socket upserts) — or dropped if
  the local read needs no API (`_dropSeededRemote`). Seeding `output` directly would
  paint full → local-only → full; seeding the contributions paints full → full.
- **Auto-fingerprinted by query *shape*.** The cache key is
  `structuralCacheKey(query)` — the selector is run through `normalizeSelector`
  so runtime **values** (language / pinned id lists, …) collapse to placeholders,
  and `$sort`/`$limit`/`use_index` are folded in verbatim. Queries that differ
  only in their values **share one entry**, so the key space stays small and fixed
  (~one per call-site shape) — **no eviction/TTL needed**. (This mirrors the fixed
  hand-named keys the app used before, but derived automatically.)
  - *Collision caveat:* two **different** call sites with an identical shape but a
    different constant (e.g. `parentTagType` Category vs Topic) map to the same
    entry. That only affects the first-paint seed — the live query supersedes it —
    so the worst case is a brief flash that self-corrects.
- **Never a needless re-render.** `_recompute`'s `sameWindow` guard compares the
  recomputed window against the seeded one: when the live result matches (same `_id`
  + `updatedTimeUtc`), `output` is **not** reassigned, preserving referential
  identity. Full docs are stored for this reason — a trimmed seed would `sameWindow`
  -match the live docs and never be replaced, leaving the UI on docs missing
  `text`/`fts`.
- **Bounded & safe.** Writes fire only on a real visible change (not every socket
  batch / live emit) and never from the provably-empty branch (so a transient empty
  `$in` can't clobber a good entry). Each entry is capped to the query's `$limit`
  (or 50) docs **total** across both buckets (local kept first), and writes are
  wrapped against `QuotaExceededError` — on overflow the feature degrades to "no
  seed", never throwing onto the recompute path.

### Offline document persistence (opt-in)

```ts
const items = useHybridQuery<ContentDto>(query, { persistOffline: true });
```

`{ persistOffline: true }` writes the API supplement's older-tail docs to **IndexedDB**
(`db.bulkPut`) so a tile backed by them is **openable offline** — `SingleContent` reads
`db.docs` by slug and, offline, shows nothing for a doc that isn't there, so without
persistence an online-only tile is a dead link → 404. Off by default; independent of
`cache` and `live`.

**Not the same as `cache`.** `cache` keeps a localStorage *window* for a fast first
paint (latency); `persistOffline` keeps the *documents* in IndexedDB (durability). They
are orthogonal and composable — set both for a list that paints instantly **and** opens
offline.

- **Privacy hard floor.** Only docs the client's `syncList` permits in IndexedDB are
  written — the same `isSyncableDoc` gate the socket feed uses. A `persistOffline` query
  over a non-syncable type (e.g. the CMS's `{ type: user, sync: false }`) persists
  **nothing**, regardless of the flag. One shared definition of "may this touch
  IndexedDB?", so the two paths can't drift.
- **Retention & eviction (unified).** Persisted docs would otherwise accumulate as the
  sync window slides (sync2 never deletes below-cutoff content — `trim()` only clamps
  syncList *state*). A keep-alive deadline per doc is kept in a `retention` side table,
  refreshed whenever the doc is *touched*: persisted by a supplement, **featured in any
  HybridQuery output** (every recompute stamps the below-cutoff `_local` docs —
  throttled), or **opened in detail** (`SingleContent` calls `touchRetention`).
  `evictStaleBelowCutoff` — run after each content sync, so only while **online** —
  deletes below-cutoff Content whose deadline has passed or was never set. This covers
  *both* `persistOffline` docs and content that slid out of the sync window. TTL defaults
  to **30 days** (`SharedConfig.offlineRetentionTtlMs`).
- **Deferred, batched writes.** `touchRetention` only mutates in-memory state and a doc
  is re-stamped at most once/day; a single `retention.bulkPut` flushes every ~10s (and
  before eviction / on page hide). Stamps live in a side table, **not on `docs`**, so
  stamping never rewrites a document — no liveQuery self-churn, no corpus recompute, and
  a sync/socket doc-rewrite can't clobber a stamp.
- **v1 limitations.** Only the POST result is persisted — socket upserts to below-cutoff
  docs update the in-memory `_remote` but are not written through, so an offline reader
  sees the doc at its POST-time revision. There is no hard size cap (TTL + eviction is
  the bound); a `QuotaExceededError` on persist is swallowed, degrading to the
  no-persistence behaviour.

### `useHybridQuery<T>(query, options?)` — composable

A thin wrapper that constructs the class and returns **only** its `output` ref —
the simplest way to consume `HybridQuery` from a component:

```ts
const items = useHybridQuery<ContentDto>(query, { live: true });
// template: <div v-for="d in items" :key="d._id">…</div>
```

It auto-disposes on unmount: `HybridQuery` registers `onScopeDispose` in its
constructor, and the composable is a plain synchronous call, so the instance is
owned by the **caller's effect scope**. Call it synchronously in `setup` /
`<script setup>` (or after a top-level `await`). Same contract — and same
caveats — as `useDexieLiveQuery`:

- **Setup-only.** Outside an effect scope (event handler, `.then`, module
  top-level) it won't auto-dispose, and the return value carries no `dispose()`
  handle — use the `HybridQuery` class directly there.
- **`<KeepAlive>`.** Disposal fires on real unmount, not on deactivation, so a
  cached ("recycled") page keeps its instance and **socket listener** alive in
  the background until the cache evicts it.
- **Reactive query.** A plain `MangoQuery` object is captured once; pass a
  `() => MangoQuery` **thunk** (reading `ref.value` inside) for a query that
  rebuilds when its dependencies change — see "Reactive queries (dependency
  tracking)" below. There is no `deps` array; the thunk's refs are auto-tracked.

### Other exports

- `postQuery<T>(query)` — bare network call against `/query`. Applies the
  `DEFAULT_REMOTE_QUERY_LIMIT` (500) as the **default** when `$limit` is omitted
  (caller-supplied limits are forwarded unchanged, not clamped).
- `initHybridQuery(http)` — wire the HTTP service once at app startup
  (`shared/src/luminary.ts`).
- `DEFAULT_REMOTE_QUERY_LIMIT = 500`.

## Provably-empty short-circuit

Before routing, the constructor checks `isProvablyEmpty(selector)` (from
`MangoQuery/`). If the selector is **unsatisfiable by construction** — today that
means an empty `$in` (`{$in: []}`, e.g. a `parentTags $elemMatch $in []` filter
built from an empty category list) sitting in a conjunctive position — `output`
stays `[]` and the class skips the Dexie read, the API supplement POST, **and**
the socket listener entirely. `mangoToDexie` applies the same check, so every
local query (not just HybridQuery) avoids scanning + filtering every row out for a
result that's empty by construction. The check is sound (never skips a query that
could match) but intentionally incomplete — it does not detect contradictions or
`$all: []`.

## Reactive queries (dependency tracking)

The query may be a `() => MangoQuery` **thunk**; read `myRef.value` directly inside
it. When a ref the thunk reads changes, the whole query rebuilds.

A thunk is reactive **in either mode** — the thunk decides *when the query is
rebuilt*, `live` decides *how the data stays fresh*:

| query form | `live: false` (one-shot) | `live: true` |
| --- | --- | --- |
| static `MangoQuery` object | read once | live Dexie + socket; **query fixed** |
| `() => MangoQuery` thunk | **re-query on each dep change** (snapshot) | live **+ dependency tracking** |

So a static query never re-queries (any mode), a thunk re-queries on every dep
change (any mode), and `live` adds the continuous `liveQuery` + socket on top. A
one-shot thunk is the lighter "re-fetch when the params change, but don't hold a
live subscription" option (no `liveQuery`/socket between changes).

```ts
const items = useHybridQuery<ContentDto>(
    () => ({ selector: { parentTags: { $elemMatch: { $in: pinnedCats.value } } } }),
    { live: true },   // rebuilds whenever pinnedCats changes
);
```

### How it works

When the query is a thunk, the constructor watches the **auto-tracked** thunk (Vue
watch-getter) — regardless of `live`; every `ref.value` the thunk reads is a
dependency (re-tracked each run, like `computed`, so conditional reads are fine) —
**no `deps` array**, so you can't forget one. The watcher compares the
**serialized** query, so it rebuilds only when the query *actually* changes (a ref
reassigned to an equal-shaped value → no rebuild). Each rebuild is a "generation":
the previous generation's local read, API POST and (in live mode) socket predicates
are torn down and re-created together; in-flight POSTs from the previous query are
discarded by a generation guard.

### Requirements & caveats

- **The thunk must be pure and must not throw on its first call** — it is called
  more than once per change. A throw on the *initial* evaluation propagates out of
  the constructor (breaking `<script setup>`); a throw on a *later* evaluation is
  surfaced through Vue's watcher error path (your app error handler) rather than
  crashing, and that rebuild is skipped. So guard refs that can be `null`/undefined
  on first render, and build the selector deterministically (stable key order —
  normal object-literal builders are fine).
- **Read the refs *inside* the thunk** — `() => ({ selector: { x: myRef.value } })`,
  not `const x = myRef.value` captured outside. Only reads inside the thunk are
  tracked.
- **To drop a field, OMIT it — never set it to `undefined`.** `{ x: undefined }`
  means "x must be missing" to Mango (it is *not* the same as an absent `x`), and
  the rebuild key now distinguishes the two, so an `undefined`-valued field both
  changes the result set *and* triggers a rebuild — usually not what you intend.
- **Output on change is kept until the new query produces data** (no flash) —
  **except** a provably-empty new query clears `output` immediately. Content /
  synced queries recompute from local Dexie instantly, so they show the *new*
  query's results right away (offline included). An **api-only** query (a type with
  no local copy) is the exception: while offline or if the new POST fails, `output`
  keeps the **previous selector's** result until the next successful POST/reconnect
  — i.e. it shows data for the prior query, by design (keep-last-value).
- **No built-in debounce.** Rapid changes rebuild per *distinct* query (last-wins,
  safe — old POSTs are discarded). For a fast-typing filter, debounce the ref
  **upstream** (as `useFtsSearch` does); HybridQuery does not debounce.
- This auto-track thunk form is the **preferred** reactive pattern — the `deps`
  option on `useDexieLiveQuery` is `@deprecated` in its favour.

## Routing

```
                       ┌────────────────────────┐
                       │ new HybridQuery(query) │
                       └───────────┬────────────┘
                                   │
                                   ▼
                          ┌───────────────────┐
                          │   readType(q)     │
                          └─────────┬─────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                │                                       │
       type === "content"                  type !== "content"
                │                                       │
                ▼                                       ▼
       mangoToDexie → output            typeIsInSyncList(type)?
                │                          │            │
                ▼                         yes           no
       decideContentApiQuery       ┌──────────┐   ┌──────────┐
                │                  │ Dexie    │   │  API     │
        ┌───────┴───────┐          │ only     │   │  only    │
        │               │          └──────────┘   └──────────┘
   needs API         done                            │
        │                                            │
        ▼                                            ▼
   runApiWhenOnline (POST when online; defer if offline) → merge into output
```

### Branch A — content

Content is the only **partially synced** type — sync only pulls content with
`publishDate >= cutoff`.

1. Run Dexie via `mangoToDexie`, merge the result into `output` (instant render).
2. `decideContentApiQuery(query, local)` chooses one of:
   - **Has `$limit`** and `local.length === $limit` → done, no API.
     Otherwise POST with selector `+ publishDate <= cutoff` and
     `$limit = $limit − local.length`.
   - **No `$limit`, has `_id: { $in: [...] }`** and every requested id is
     local → done. Otherwise POST `_id ∈ missing` AND `publishDate <= cutoff`
     (no sort/limit).
   - **No `$limit`, no id list** → always POST the original selector
     `+ publishDate <= cutoff`.
3. On a POST, merge the response into `output`.

### Branch B — non-content (all-or-nothing)

- Type present in `syncList` (any chunkType matches) → fully synced → Dexie
  only, no API.
- Type absent from `syncList` → not synced locally → API only, no Dexie read.
  The whole original query is forwarded (no `publishDate` clause appended).
- `readType` returning `undefined` (typeless query, `$or` across types,
  non-equality on `type`) falls into this "not in syncList" arm and routes
  to API-only — safe by default.

The "API only" path goes through the same `runApiWhenOnline` as the content
branch, so its POST is deferred while offline and fires on reconnect.

## The content cutoff

The cutoff lives on `SharedConfig.contentPublishDateCutoff` and is read via
`getContentPublishDateCutoff()` (`shared/src/config.ts`). It is the **single
source of truth** that bounds both:

1. **Sync depth.** `shared/src/rest/sync2/sync.ts` **defaults** content
   `publishDateMin` to `getContentPublishDateCutoff()` when the caller omits
   one (a caller-supplied bound is preserved unchanged) — content older than
   the cutoff is **not synced** and `trim` keeps IndexedDB bounded accordingly.
2. **Query routing.** `HybridQuery` appends `publishDate <= cutoff` to the
   remote query — the API supplies only the older tail.

Because `config` is set once at `init(...)`, the cutoff is effectively static
for the app lifecycle (and is re-read on each app open).

| Caller | Value passed at `init(...)` |
| --- | --- |
| **App** | Rolling: `Date.now() - CONTENT_SYNC_WINDOW_MS` (define `CONTENT_SYNC_WINDOW_MS` in app config — e.g. ~12 months). |
| **CMS** | Omit (or pass `OPEN_MIN`) — editors need the full content set. |

Sentinels: `OPEN_MIN` means *no cutoff* (full sync; routing fetches nothing
older). `OPEN_MAX` is only used internally by sync2 as an upper bound.

## Pinning the CouchDB index

**Content `HybridQuery` callers SHOULD set `use_index: "content-publishDate-index"`.**
The remote supplement appends `publishDate <= cutoff` to the selector and (when
the caller sorts) carries `$sort` along, but Content selectors are complex enough
(`mangoIsPublished`'s `$or` branches, the per-`parentType` `$or` injected by the
API, the `parentPostType`/`parentTagType`/`parentPinned`/… filters callers add on
top) that CouchDB's mango picker won't reliably pick the partial publishDate
index. That produces either:

- a 400 `No index exists for this sort, try indexing by the sort fields.` on
  **sorted** queries, or
- a `documents examined is high` warning + slow scan on **unsorted** queries.

The API validator
([`api/src/db/MongoQueryTemplates/validators/hybridQuery.ts`](../../../../api/src/db/MongoQueryTemplates/validators/hybridQuery.ts))
enforces a hard-coded allowlist of permitted `use_index` values — today that's
exactly **`"content-publishDate-index"`** (backed by
[`api/src/db/designDocs/content-publishDate-index.json`](../../../../api/src/db/designDocs/content-publishDate-index.json)).
Any other value 400s. To add a new index: create the design doc, then add the
name to `ALLOWED_USE_INDEX`.

### When you add a new index, plan for the auto-appended `publishDate`

The remote query for a Content `HybridQuery` always carries an
**auto-appended `publishDate <= cutoff` clause** (see "What actually hits the
wire" in the canonical example above, and "The content cutoff" below for where
the value comes from). Any new design doc you write to satisfy a different
caller MUST account for this:

- **If the caller sorts by `publishDate`** (the common case): your index's
  leading field should be `publishDate` — like
  [`content-publishDate-index.json`](../../../../api/src/db/designDocs/content-publishDate-index.json).
  The partial filter selector should still include `type === "content"` so the
  picker only considers it for Content queries.
- **If the caller sorts by something else** (e.g. `slug`, `parentPinned`): the
  index needs to cover the **sort field as the leading column** AND include
  `publishDate` somewhere in `fields` (so CouchDB can evaluate the appended
  `$lte: cutoff` clause via the index rather than via a row scan).
  CouchDB does not require sort fields to appear in the selector, but unmatched
  selector fields force a row scan that produces the `documents examined is high`
  warning even when an index is picked.
- **If the caller is unsorted**: you can still benefit from an index — make
  `publishDate` part of `fields` so the auto-appended clause is index-evaluated.

Whatever the shape, the design doc's `_id` (e.g. `_design/<your-index-name>`)
must be added verbatim to `ALLOWED_USE_INDEX`; otherwise the validator 400s the
request before it ever reaches CouchDB.

`HybridQuery` forwards `use_index` to the API on the **always-post** and
**limit-shortfall** branches and intentionally **drops it on the id-diff branch**
(an `_id` lookup uses the built-in `_id` index — a sort-oriented hint would be
wrong for that shape). So setting `use_index` on every Content query is safe.

Pattern matches sync2 (`shared/src/rest/sync2/syncBatch.ts`) — index selection
is a client-side concern, keeping the API lean.

## Offline / reconnect

If `isConnected.value` is `false` when an API call is needed, the class
subscribes to it and fires the POST exactly once when it next flips `true`
(run-once guard makes connection-flapping safe).

The watcher's `stop` handle is registered as a class disposer, so:

- **Auto-teardown:** the constructor calls
  `if (getCurrentScope()) onScopeDispose(() => this.dispose())`. When the
  consuming component unmounts, Vue disposes its effect scope → `dispose()` →
  the pending watcher is removed. This works even when `new HybridQuery(...)`
  sits after a top-level `await` in `<script setup>` — Vue's
  `withAsyncContext` keeps the scope valid across awaits.
- **Manual teardown:** a non-component caller (rare — outside any active
  effect scope) must call `q.dispose()` itself.

## Merge semantics

`output` is recomputed (`_recompute`) from two separately-tracked contributions —
`_local` (the Dexie result) and `_remote` (the one-shot API supplement) — as
`applySortLimit(mergeById(_local, _remote), $sort, $limit)`:

- **Union, not replace, across sources.** The remote query may fetch only the
  older tail (`publishDate <= cutoff`), so fresh local docs above the cutoff
  *must* be retained alongside it. Local-only docs above the cutoff survive a
  remote merge.
- **Local replaced wholesale, remote persists.** In live mode each Dexie emission
  replaces `_local` entirely (so deletions drop out), while `_remote` is kept
  from the one-shot API fetch. In one-shot mode each is simply set once.
- **Conflict resolution.** `mergeById(_local, _remote)` keeps the doc with the
  higher `updatedTimeUtc` for any given `_id`; with `_local` seeding and
  `_remote` layered on top, the remote copy wins `updatedTimeUtc` ties (argument
  order is load-bearing — don't flip it).
- **View shape.** `$sort` and `$limit` from the original query are re-applied on
  every recompute so the truncated view always reflects the current merged set.

## What's deliberately out of scope (for now)

- **Dexie live-query reactivity** — now **opt-in** via `{ live: true }` (see "Live
  mode" above). In the **default one-shot mode**, `output` still updates at most
  twice (local read, then merged remote) and local IndexedDB changes after the
  initial read do not flow in.
- **Live socket updates** are now **wired in live mode** (see "Live socket updates
  (live mode)" above) — the remote contribution stays live off the global
  changefeed. What remains out of scope is **offline-gap healing**: on reconnect
  the listener only re-attaches, so changes (especially deletes) that happened
  while offline are not re-fetched until remount. See that section's "Shortcomings"
  and "Planned future work". In the **default one-shot mode** there is no socket
  listener at all.
- **Persisting remote-supplement docs to Dexie.** Older docs fetched on demand
  live in `output` only; they're not written back to IndexedDB. A new mount
  will re-fetch on demand. Consequence in live mode: if a doc was also fetched
  into `_remote` (the older tail), deleting it locally lets `mergeById`
  **resurrect the remote copy** — consistent with the documented union
  semantics; a true fix needs remote invalidation (out of scope).
- **Read-failure parity in live mode.** `useDexieLiveQuery` retries a failing
  Dexie read silently every 100ms and never emits, so on a *persistent* local
  read failure in live mode `onLocal` never runs and the one-shot API supplement
  is never decided — unlike one-shot mode, where a failed read still triggers the
  API with an empty local set.
- **Re-running on syncList changes.** `syncList` is a reactive ref, but
  `HybridQuery` reads it exactly once at construction (via `typeIsInSyncList`)
  and never re-evaluates. Similarly the cutoff is read once per merge — but
  it comes from `config`, which is set once at init, so it's effectively
  static for the lifecycle.

## Migration note

Compared to the previous committed state of this module:

- **`hybridQuery(query)` (function) → `new HybridQuery(query)` (class).** The
  return shape changed from `{ result, source, isLoading, isRemotePending }` to
  `{ output, dispose() }`. Consumers should bind to `q.output.value` and rely on
  Vue scope teardown (`onScopeDispose` is wired automatically inside the
  constructor) rather than tracking `isLoading` / `isRemotePending` manually.
- **`HybridQueryResult` type is gone.** The class instance *is* the result.
- **`isQueryCovered` is no longer exported.** Routing decisions are now
  per-query (inside `decideContentApiQuery`) rather than a separate boolean.
- **`useHybridQuery(query, options?)` composable** is now provided (on top of
  `HybridQuery`) — it returns just the `output` ref and auto-disposes via the
  caller's effect scope. Prefer it in components; use the class directly only when
  you need a manual `dispose()` handle (non-setup callers). See "Public API".
- **Coverage-based routing removed.** The previous per-`(memberOf × language ×
  publishDate)` coverage analysis was replaced with the much simpler routing
  described above: `readType` chooses a branch, `decideContentApiQuery` picks
  one of three content sub-strategies, and a single global
  `getContentPublishDateCutoff()` reads from `SharedConfig`. The helpers in
  `queryIntrospection.ts` (`readType`, `typeIsInSyncList`, `findIdInList`,
  `withPublishDate`, `decideContentApiQuery`) are individually testable; the
  class just wires them.
- **New `SharedConfig.contentPublishDateCutoff`** is the single source of truth
  for partial content sync — sync2 reads it as the default content
  `publishDateMin`, and `HybridQuery` reads it for the remote `publishDate <=
  cutoff` clause. App/CMS pass it at `init(...)` (see "The content cutoff"
  above).
