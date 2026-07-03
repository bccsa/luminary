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
_because of this invariant_. Don't "fix" the `publishDate <= cutoff` clause
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

| Member                                    | Description                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `output: ShallowRef<T[]>`                 | The reactive merged set. Bind your template to `q.output.value`. In one-shot mode, mutated **once** for the Dexie-only and API-only non-content branches; **twice** for the content branch (local read, then merged remote). In **live mode** it additionally re-emits on every local IndexedDB change (see below). |
| `isFetching: ComputedRef<boolean>`        | `true` from (re)build until the generation's **complete** first result settles. See [Loading & error state](#loading--error-state).                                                                                                                                                                                 |
| `error: ShallowRef<unknown \| undefined>` | The last routing / remote / local-read error for the current generation, or `undefined`. Cleared on every rebuild. See [Loading & error state](#loading--error-state).                                                                                                                                              |
| `dispose(): void`                         | Stop the reconnect watcher and (in live mode) the Dexie live-query subscription. Idempotent. Called automatically when the owning Vue scope disposes.                                                                                                                                                               |

### Loading & error state

`isFetching` lets a consumer tell **"still fetching"** from **"fetched, genuinely
empty"** — `output` is `[]` in both cases, so it alone can't gate an empty-state or a
spinner.

It is derived from two independent pending flags, `isFetching = localPending ||
remotePending`, so it stays `true` until the generation's **complete** first result has
settled across both legs:

- **Local leg** — clears once the Dexie read produces its first result. The content and
  fully-synced branches read locally; the API-only branch has no local leg.
- **Remote leg** — clears once the supplement / API-only POST settles (resolves OR fails),
  or, when **offline**, immediately once the fetch is parked on the reconnect watcher
  (parked ≠ fetching). The later, post-reconnect background POST
  deliberately does **not** re-enter loading (data has already painted from local/cache;
  flipping `isFetching` back to `true` would surprise empty-state consumers).

Consequences worth noting:

- For the **content** branch, local settles first and paints data while the supplement is
  still in flight — so `isFetching` can be `true` even though `output` already has rows.
  That's intentional: it tracks "still fetching", not "has no data".
- The **response-cache seed** paints `output` synchronously but does **not** settle
  `isFetching` — a cache-painted window is still "fetching" until the authoritative read
  lands.
- A **rebuild** (reactive-thunk dep change, or a live re-evaluation) re-enters loading:
  `isFetching` returns to `true` until the new generation settles.
- The **provably-empty** short-circuit settles `isFetching` to `false` immediately (it
  never reads or POSTs).

`error` is last-error-wins and is cleared synchronously on every rebuild. It is set on a
**total** remote failure (every fan-out POST failed) and on a local Dexie read failure; a
**partial** fan-out failure (some parents returned) keeps the succeeded subset and does
**not** raise `error`. Errors are always also `console.error`'d.

> `useHybridQuery` returns only `output`. To bind `isFetching` / `error`, use
> `useHybridQueryWithState` (below), or hold the `HybridQuery` instance directly.

### Live mode (opt-in)

```ts
const q = new HybridQuery<ContentDto>(query, { live: true });
```

`HybridQueryOptions = { live?: boolean; cache?: boolean }` is a second constructor
argument (`cache` is covered under "Response caching" below; default `live: false`
— one-shot). With `live: true`,
the **local Dexie source** is read reactively via `useDexieLiveQuery`: every
IndexedDB change re-runs the query, replaces the local contribution wholesale
(so **local deletions drop out of `output`**), and re-applies the same dedup +
sort/limit. Cross-tab reactivity comes for free (Dexie's `liveQuery` propagates
across tabs).

The **API supplement POST stays one-shot** in both modes — it is decided exactly
once off the _first_ local result (gated by an internal `_apiDecided` flag) and
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

Live socket updates are applied via a `mangoCompile`-based predicate over the
`/query` model.

The feed carries **all** changes the user has access to (the server streams the
CouchDB changefeed; it's the _global_ client handler in `socketio.ts` that narrows
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
5. **`_remote` is not persisted to Dexie by default.** Older-tail docs live in memory
   only; a remount re-fetches. Opt into `{ persistOffline: true }` to write the
   supplement to IndexedDB (see "Offline document persistence" below); once a
   below-cutoff doc is retention-listed, the global socket handler also writes live
   updates to it through to Dexie.
6. **Live mode must be disposed.** A non-component caller that forgets `dispose()`
   leaks the Dexie subscription **and** the socket listener.

#### Planned future work

- **Reconnect gap-fetch / offline-gap healing.** The gap is _temporal_: track the
  max `updatedTimeUtc` seen and, on a **debounced** reconnect, fetch only
  `supplementSelector + updatedTimeUtc > lastSeen` (upserts). Offline-delete
  healing needs a "DeleteCmds since lastSeen" query — which is what sync already
  does — so this likely belongs as a **sync extension**, not a per-instance
  mini-sync.

### Response caching (opt-in)

```ts
const q = new HybridQuery<ContentDto>(query, { cache: true });
```

With `{ cache: true }`, `HybridQuery` **seeds its two contributions from the last
persisted window on (re)build, then persists each new window back** — moving the
manual "cached initial value, update when the slow query resolves" pattern a
caller would otherwise hand-roll into the query layer. Independent of `live`, and
works for both static and thunk queries.

- **Synchronous first paint.** The seed is read from **`localStorage`** (not
  IndexedDB) inside `_run`, _before_ any local/remote read for the generation —
  so a remount paints the cached window on the **first frame**, with no race and
  no race-gating. localStorage also avoids contending with sync on IndexedDB,
  which is busiest exactly at startup (when the seed matters most).
- **Seeds the contributions, not `output` — so the seed never collapses.** The
  persisted window is stored **split by source** (`{ local, remote }`): the `local`
  docs seed `_local` and the older-tail `remote` docs seed `_remote`, then a
  `_recompute` paints the merged window. Because the seed flows _through_ the normal
  merge pipeline (not laid on top of `output`), the first real Dexie read —
  `_setLocal`, which replaces `_local` wholesale — recomputes against the _still-seeded_
  `_remote`, so the view doesn't shrink to local-only while the API supplement is in
  flight. The seeded remote is superseded when the POST resolves (`_setRemote` drops
  seeded docs the POST didn't re-supply, keeping any socket upserts) — or dropped if
  the local read needs no API (`_dropSeededRemote`). Seeding `output` directly would
  paint full → local-only → full; seeding the contributions paints full → full.
- **Auto-fingerprinted by query _shape_.** The cache key is
  `structuralCacheKey(query)` — the selector is run through `normalizeSelector`
  so runtime **values** (language / pinned id lists, …) collapse to placeholders,
  and `$sort`/`$limit`/`use_index` are folded in verbatim. Queries that differ
  only in their values **share one entry**, so the key space stays small and fixed
  (~one per call-site shape) — **no eviction/TTL needed**.
    - _Collision caveat:_ two **different** call sites with an identical shape but a
      different constant (e.g. `parentTagType` Category vs Topic) map to the same
      entry. That only affects the first-paint seed — the live query supersedes it —
      so the worst case is a brief flash that self-corrects.
    - _Disambiguating a harmful collision:_ when two cached feeds share a shape and
      are mounted **at the same time** (so they'd seed from each other), pass a distinct
      `{ cacheId }` per call site — it is folded into `structuralCacheKey` to give each
      its own entry.
- **Never a needless re-render.** `_recompute`'s `sameWindow` guard compares the
  recomputed window against the seeded one: when the live result matches (same `_id`
    - `updatedTimeUtc`), `output` is **not** reassigned, preserving referential
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
(`db.bulkPut`) so an item backed by them is **openable offline** — a detail view that
reads `db.docs` by slug shows nothing, offline, for a doc that isn't there, so without
persistence an online-only item is a dead link → 404. Off by default; independent of
`cache` and `live`.

**Not the same as `cache`.** `cache` keeps a localStorage _window_ for a fast first
paint (latency); `persistOffline` keeps the _documents_ in IndexedDB (durability). They
are orthogonal and composable — set both for a list that paints instantly **and** opens
offline.

- **Privacy hard floor.** Only docs the client's `syncList` permits in IndexedDB are
  written — the same `isSyncableDoc` gate the socket feed uses. A `persistOffline` query
  over a non-syncable type (e.g. a `{ type: user, sync: false }` entry) persists
  **nothing**, regardless of the flag. One shared definition of "may this touch
  IndexedDB?", so the two paths can't drift.
- **Retention & eviction (unified).** Persisted docs would otherwise accumulate as the
  sync window slides (sync never deletes below-cutoff content — `trim()` only clamps
  syncList _state_). A keep-alive deadline per doc is kept in a `retention` side table,
  refreshed whenever the doc is _touched_: persisted by a supplement, **featured in any
  HybridQuery output** (every recompute stamps the below-cutoff `_local` docs —
  throttled), or **opened in detail** (the consumer calls `touchRetention`).
  `evictStaleBelowCutoff` — run after each content sync, so only while **online** —
  deletes below-cutoff Content whose deadline has passed or was never set, and reaps
  expired `retention` rows (including **orphans** — rows whose doc was stamped but never
  persisted, e.g. a viewed online-only article). This covers _both_ `persistOffline` docs
  and content that slid out of the sync window. TTL defaults to **30 days**
  (`SharedConfig.offlineRetentionTtlMs`).
- **Live socket updates are retention-gated.** The global socket `data` handler writes a
  below-cutoff Content update through to `db.docs` **only if a retention row exists** for
  it — so a live edit to an offline-cached older article stays fresh, while a below-cutoff
  doc we aren't caching is left out of IndexedDB (it would otherwise be written then
  evicted on the next sync). Above-cutoff / non-Content docs and DeleteCmds are unaffected.
- **Deferred, batched writes.** `touchRetention` only mutates in-memory state and a doc
  is re-stamped at most once/day; a single `retention.bulkPut` flushes every ~10s (and
  before eviction / on page hide). Stamps live in a side table, **not on `docs`**, so
  stamping never rewrites a document — no liveQuery self-churn, no corpus recompute, and
  a sync/socket doc-rewrite can't clobber a stamp.
- **Limitations.** There is no hard size cap (TTL + eviction is the bound); a
  `QuotaExceededError` on persist is swallowed, degrading to the no-persistence behaviour.

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

### `useHybridQueryWithState<T>(query, options?)` — composable

Identical to `useHybridQuery` (same signature, lifecycle, and options), but returns the
full reactive bundle `{ output, isFetching, error }` instead of only `output`. Use it to
drive a spinner or an empty-state — see [Loading & error state](#loading--error-state).

```ts
const { output, isFetching, error } = useHybridQueryWithState<ContentDto>(query);
// template: <Spinner v-if="isFetching" />
//           <Empty v-else-if="!output.length" />
```

`useHybridQuery` is itself a thin wrapper over this — it constructs the instance the same
way and returns `.output` — so there is a single construction path.

### `useSharedHybridQuery<T>(query, options?)` / `useSharedHybridQueryWithState<T>(...)` — shared composables

Same signatures and returned shape as the pair above, but the underlying `HybridQuery` is
**shared** across all callers that pass the same query **value** and the same
output-affecting options (keyed on both — two reads that differ only in
`stripFields`/`cache`/… do not share). Use these for **constant reference-list reads** —
languages, groups, storage, auth providers — so N call sites collapse to one Dexie live
query and at most one cold-start `/query` instead of one each.

The shared instance is app-lifetime (created lazily, never disposed — reference data is
always wanted), so callers don't own its teardown; a component just reads the refs and its
own bindings stop on unmount. Because of that, **do not pass a reactive thunk** (one whose
value changes) — its value is snapshotted at first acquire, so later subscribers would
silently get the first caller's instance. For per-component, reactive, or transient queries
use plain `useHybridQuery` (sharing can't be inferred — it's a property the caller asserts
by choosing the shared variant).

### Other exports

- `queryLocal<T>(query)` — awaitable one-shot read of the **local** IndexedDB
  document cache (`db.docs`). Resolves the matches (possibly empty); never hits the
  API. The imperative counterpart to `useHybridQuery`, for boot-time / non-Vue code.
- `queryRemote<T>(query)` — awaitable one-shot read of the **remote** API
  (`POST /query`). Applies the `DEFAULT_REMOTE_QUERY_LIMIT` (500) as the **default**
  when `$limit` is omitted (caller-supplied limits are forwarded unchanged, not
  clamped). (`HybridQuery` is `queryLocal` merged with `queryRemote`, kept reactive.)
- `initHybridQuery(http)` — wire the HTTP service once at startup
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

A thunk is reactive **in either mode** — the thunk decides _when the query is
rebuilt_, `live` decides _how the data stays fresh_:

| query form                 | `live: false` (one-shot)                   | `live: true`                         |
| -------------------------- | ------------------------------------------ | ------------------------------------ |
| static `MangoQuery` object | read once                                  | live Dexie + socket; **query fixed** |
| `() => MangoQuery` thunk   | **re-query on each dep change** (snapshot) | live **+ dependency tracking**       |

So a static query never re-queries (any mode), a thunk re-queries on every dep
change (any mode), and `live` adds the continuous `liveQuery` + socket on top. A
one-shot thunk is the lighter "re-fetch when the params change, but don't hold a
live subscription" option (no `liveQuery`/socket between changes).

```ts
const items = useHybridQuery<ContentDto>(
    () => ({ selector: { parentTags: { $elemMatch: { $in: pinnedCats.value } } } }),
    { live: true }, // rebuilds whenever pinnedCats changes
);
```

### How it works

When the query is a thunk, the constructor watches the **auto-tracked** thunk (Vue
watch-getter) — regardless of `live`; every `ref.value` the thunk reads is a
dependency (re-tracked each run, like `computed`, so conditional reads are fine) —
**no `deps` array**, so you can't forget one. The watcher compares the
**serialized** query, so it rebuilds only when the query _actually_ changes (a ref
reassigned to an equal-shaped value → no rebuild). Each rebuild is a "generation":
the previous generation's local read, API POST and (in live mode) socket predicates
are torn down and re-created together; in-flight POSTs from the previous query are
discarded by a generation guard.

### Requirements & caveats

- **The thunk must be pure and must not throw on its first call** — it is called
  more than once per change. A throw on the _initial_ evaluation propagates out of
  the constructor (breaking `<script setup>`); a throw on a _later_ evaluation is
  surfaced through Vue's watcher error path (the consumer's error handler) rather than
  crashing, and that rebuild is skipped. So guard refs that can be `null`/undefined
  on first render, and build the selector deterministically (stable key order —
  normal object-literal builders are fine).
- **Read the refs _inside_ the thunk** — `() => ({ selector: { x: myRef.value } })`,
  not `const x = myRef.value` captured outside. Only reads inside the thunk are
  tracked.
- **To drop a field, OMIT it — never set it to `undefined`.** `{ x: undefined }`
  means "x must be missing" to Mango (it is _not_ the same as an absent `x`), and
  the rebuild key now distinguishes the two, so an `undefined`-valued field both
  changes the result set _and_ triggers a rebuild — usually not what you intend.
- **Output on change is kept until the new query produces data** (no flash) —
  **except** a provably-empty new query clears `output` immediately. Content /
  synced queries recompute from local Dexie instantly, so they show the _new_
  query's results right away (offline included). An **api-only** query (a type with
  no local copy) is the exception: while offline or if the new POST fails, `output`
  keeps the **previous selector's** result until the next successful POST/reconnect
  — i.e. it shows data for the prior query, by design (keep-last-value).
- **No built-in debounce.** Rapid changes rebuild per _distinct_ query (last-wins,
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
2. `decideContentApiQuery(query, local)` chooses one of: - **No cutoff configured** (`getContentPublishDateCutoff() === OPEN_MIN`) →
   done, no API, for **every** branch below. sync syncs all content, so the
   local read is already complete and a supplement POST (`publishDate <=
OPEN_MIN`) would match nothing. Returning `undefined` here also means the
   live supplement listener is never attached. - **Has `$limit`** and `local.length === $limit` → done, no API.
   Otherwise POST with selector `+ publishDate <= cutoff` and
   `$limit = $limit − local.length`. - **No `$limit`, has `_id: { $in: [...] }`** and every requested id is
   local → done. Otherwise POST `_id ∈ missing` AND `publishDate <= cutoff`
   (no sort/limit). - **No `$limit`, no id list** → always POST the original selector
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

This routing is **reactive to syncList membership**. Each non-content branch
watches the type's per-type membership boolean and re-routes on a flip: a query
built before its type was synced (cold start) re-routes API-only → Dexie-only the
moment the type's first column registers, and a Dexie-only query re-routes back to
API-only if the type is later revoked. The watch is on the derived **boolean**, so
it fires once per genuine flip — not on the per-chunk block-range churn that mutates
`syncList` during a sync. The **content** branch does not watch membership (its
routing doesn't depend on `typeIsInSyncList`), so a content feed never re-routes on
syncList changes.

## The content cutoff

The cutoff lives on `SharedConfig.contentPublishDateCutoff` and is read via
`getContentPublishDateCutoff()` (`shared/src/config.ts`). It is the **single
source of truth** that bounds both:

1. **Sync depth.** `shared/src/api/sync/sync.ts` **defaults** content
   `publishDateMin` to `getContentPublishDateCutoff()` when the caller omits
   one (a caller-supplied bound is preserved unchanged) — content older than
   the cutoff is **not synced** and `trim` keeps IndexedDB bounded accordingly.
2. **Query routing.** `HybridQuery` appends `publishDate <= cutoff` to the
   remote query — the API supplies only the older tail.

Because `config` is set once at `init(...)`, the cutoff is effectively static
for the application lifecycle (and is re-read on each load).

| Use case            | Value passed at `init(...)`                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Bounded local cache | A rolling lower bound (e.g. `Date.now()` minus a fixed window) so only recent content syncs locally; older content is fetched on demand. |
| Full local set      | Omit (or pass `OPEN_MIN`).                                                                                                               |

Sentinels: `OPEN_MIN` means _no cutoff_ (full sync; routing fetches nothing
older). `OPEN_MAX` is only used internally by sync as an upper bound.

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
([`api/src/validation/query/validateQuery.ts`](../../../../api/src/validation/query/validateQuery.ts))
accepts a `use_index` only if it names a real Mango index — the allowlist is the
registry built at boot from the design-doc JSON files
([`api/src/db/indexNameRegistry.ts`](../../../../api/src/db/indexNameRegistry.ts)),
e.g. [`content-publishDate-index`](../../../../api/src/db/designDocs/content-publishDate-index.json).
Any unknown value 400s (`Unknown index`). To add a new index: just create the
design doc — the registry picks it up automatically (no separate allowlist edit).

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

Pattern matches sync (`shared/src/api/sync/syncBatch.ts`) — index selection
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
  _must_ be retained alongside it. Local-only docs above the cutoff survive a
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

## Not implemented / known limitations

- **Reconnect / offline-gap healing (live mode).** On socket reconnect the live
  listener only re-attaches — it does not re-fetch the supplement, so changes
  (especially deletes) made while offline are missed until the next remount. See
  "Live socket updates (live mode)" → Shortcomings / Planned future work.
- **No remote invalidation (local-delete resurrection).** Deleting a doc locally
  that is also held in `_remote` (the older tail) lets `mergeById` **resurrect the
  remote copy** — consistent with the union semantics in "Merge semantics". A true
  fix needs remote invalidation; `{ persistOffline: true }` keeps the docs in
  IndexedDB but does not change this merge behaviour.
- **Read-failure parity in live mode.** `useDexieLiveQuery` retries a failing
  Dexie read silently every 100ms and never emits, so on a _persistent_ local
  read failure in live mode `onLocal` never runs and the one-shot API supplement
  is never decided — unlike one-shot mode, where a failed read still triggers the
  API with an empty local set.
- **Re-running on syncList changes.** Non-content branches **re-route** when the
  query type's `syncList` membership flips (see Branch B): the watch is on the
  per-type membership _boolean_, so it fires once per flip (cold-start
  registration or revoke), not on the per-chunk churn that mutates `syncList`
  during a sync. The **content** branch does not watch membership — its routing
  doesn't depend on it — so a content feed never re-routes mid-download. The
  cutoff is still read once per merge, but it comes from `config`, which is set
  once at init, so it's effectively static for the lifecycle.
