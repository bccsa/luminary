# hybridQuery

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
| `output: ShallowRef<T[]>` | The reactive merged set. Bind your template to `q.output.value`. Mutated **once** for the Dexie-only and API-only non-content branches; **twice** for the content branch (local read, then merged remote). |
| `dispose(): void` | Stop the reconnect watcher (and any future internal subscriptions). Idempotent. Called automatically when the owning Vue scope disposes. |

Internally the class owns the reconnect watcher and (future) socket subscription;
future live updates merge in by calling the same private `_merge` with no public
API change.

### Other exports

- `postQuery<T>(query)` — bare network call against `/query`. Applies the
  `DEFAULT_REMOTE_QUERY_LIMIT` (500) as the **default** when `$limit` is omitted
  (caller-supplied limits are forwarded unchanged, not clamped).
- `initHybridQuery(http)` — wire the HTTP service once at app startup
  (`shared/src/luminary.ts`).
- `DEFAULT_REMOTE_QUERY_LIMIT = 500`.

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

`output` is the result of `mergeById(_acc, incoming)` followed by
`applySortLimit(_acc, $sort, $limit)`:

- **Union, not replace.** The remote query may fetch only the older tail
  (`publishDate <= cutoff`), so fresh local docs above the cutoff *must* be
  retained across the local-then-remote sequence. Local-only docs above the
  cutoff survive a remote merge.
- **Conflict resolution.** `mergeById` keeps the doc with the higher
  `updatedTimeUtc` for any given `_id` (ties favour `incoming`). That's what
  "removes stale entries" means in this pass — older versions of the same id
  are replaced.
- **View shape.** `$sort` and `$limit` from the original query are re-applied
  every merge so the truncated view always reflects the current accumulator.

## What's deliberately out of scope (for now)

- **Dexie live-query reactivity.** `output` updates at most twice (local read,
  then merged remote). Local IndexedDB changes after the initial read do not
  flow into `output` automatically.
- **Persisting remote-supplement docs to Dexie.** Older docs fetched on demand
  live in `output` only; they're not written back to IndexedDB. A new mount
  will re-fetch on demand.
- **Live socket updates.** The class has a place for an internal
  `setLiveResponse`-style merge, but no socket subscription yet — when wired
  later, a single-doc `_merge([doc])` will be enough and the public API stays
  unchanged.
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
- **`useHybridQuery` (the reactive composable) is shelved** as
  `useHybridQuery.ts.old`. The reactive variant will be rewritten on top of
  `HybridQuery` in a follow-up; for now construct the class directly inside
  `<script setup>` and let `onScopeDispose` handle cleanup.
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
