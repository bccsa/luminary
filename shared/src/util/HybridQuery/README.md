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

`HybridQueryOptions = { live?: boolean }` is a second constructor argument
(default `live: false` — one-shot, the original behaviour). With `live: true`,
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
5. **`_remote` is not persisted to Dexie.** Older-tail docs and socket upserts to
   them live in memory only; a remount re-fetches.
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
- **Static query.** Captured once at construction; a changing query means
  dispose + reconstruct (reactive `deps` are not wired yet).

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
