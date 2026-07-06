# 12. CMS reactive document reads via HybridQuery; retire the RxJS-backed `db.toRef` family

Date: 2026-06-24

## Status

Accepted

## Context

Luminary is offline-first: a client syncs the documents it has access to into IndexedDB
(Dexie) and must keep working without a network. Historically, reactive document reads
were spread across three different mechanisms, and screens picked between them
inconsistently:

- **`useDexieLiveQuery`** — a thin wrapper over Dexie's `liveQuery`. IndexedDB-only; it
  cannot reach content that is outside the device's sync window, and it has no socket
  live-update path of its own.
- **`ApiLiveQuery`** — REST + Socket.io. Server-only; it does not read the local Dexie
  cache, so it does not work offline.
- **The `db.toRef` family** on the `Database` class (`getAsRef`, `getBySlugAsRef`,
  `someByTypeAsRef`, `whereTypeAsRef`, `whereParentAsRef`, `tagsWhereTagTypeAsRef`,
  `contentWhereTagAsRef`, `isLocalChangeAsRef`) — Dexie `liveQuery` wrapped as an **RxJS
  `Observable`** via `@vueuse/rxjs`' `useObservable`. These were already `@deprecated`.
  They were also the **only** code in the monorepo that pulled in `@vueuse/rxjs` + `rxjs`.

The CMS in particular needs *both* worlds: synced doc types (Group, Language, Post, Tag,
Redirect, Storage, …) should read locally so the editor works offline, while non-synced
types (User, AutoGroupMappings) and content older than the sync window must come from the
API. No single one of the three mechanisms above covers that, so the CMS had a patchwork
of Dexie-only reads, API-only reads, and deprecated RxJS refs — hard to reason about, and
the RxJS path was carrying two dependencies for a deprecated API.

`useHybridQuery` (shared — see `shared/src/util/HybridQuery/README.md` for the mechanism)
resolves this: it is **Dexie-first for synced doc types** (reads IndexedDB, supplements
the older tail from the API via `POST /query`, and subscribes to Socket.io for live
updates), and **API-only for non-synced types**. One mechanism, one mental model, and it
is RxJS-free — both `useHybridQuery` and `useDexieLiveQuery` subscribe to Dexie's
`liveQuery` directly.

## Decision

1. **Migrate every CMS reactive `db.docs` read to `useHybridQuery` /
   `useHybridQueryWithState`** (~30 files: overviews, display cards, selectors, editors,
   and the reference-list reads for groups/languages/auth-providers/storages). `ApiLiveQuery`
   is no longer instantiated anywhere in the CMS.

2. **Call `useHybridQuery` directly at each point of use, not via a hoisted singleton.**
   HybridQuery freezes its Dexie-vs-API routing at **construction time** (it only
   re-evaluates when the query *value* changes). A query built early — before sync has
   registered its doc type — would lock into API-only mode permanently. Invoked in a
   component `setup` (post-sync), it routes Dexie-first correctly. We briefly DRY'd these
   into a shared `useDocsByType` singleton and removed it for exactly this reason.

3. **Keep two deliberate `useDexieLiveQuery` carve-outs:**
   - `globalConfig.initLanguage()` reads the Language list — it runs at startup *before*
     `initSync()`, so a HybridQuery built there would hit the construction-time trap and
     lock API-only. A plain Dexie live query has no such timing dependency (and languages
     are always fully synced).
   - `DashboardPage` `pendingChanges` reads the local **`localChanges`** outgoing-edit
     queue, not `db.docs`. HybridQuery only queries `db.docs`, so it structurally cannot
     serve this; `useDexieLiveQuery` is the correct tool.

4. **Once the last consumer migrated, delete the deprecated `db.toRef`/`*AsRef` family
   from `shared/src/db/database.ts` and drop `@vueuse/rxjs` + `rxjs`** from
   `shared/package.json`. The non-reactive raw helpers (`db.get`, `db.whereParent`,
   `db.tagsWhereTagType`, `db.contentWhereTag`) are kept — they are not reactive and do
   not depend on RxJS.

## Why

- **Offline-first correctness.** Synced types must read from IndexedDB (so the CMS works
  offline); older / non-synced data must come from the API. HybridQuery does both behind
  one API; the old split (`useDexieLiveQuery` *or* `ApiLiveQuery`) forced an either/or.
- **Consistency.** One read mechanism instead of three removes a recurring "which one do
  I use here?" decision and makes behaviour (loading state, live updates, dedup)
  uniform and testable.
- **Fewer dependencies.** The `db.toRef` family was the sole user of `@vueuse/rxjs` +
  `rxjs`; removing it drops two dependencies and the associated bundle weight.
- **Remove a footgun.** The deprecated refs invited new pre-sync/early reads that would
  silently lock API-only. Deleting them, and documenting the "call at point of use" rule
  plus the two carve-outs, prevents that class of regression.

## Consequences

- CMS reactive reads are now unified on HybridQuery; `@vueuse/rxjs` and `rxjs` are gone
  from `shared`, and the deprecated `db.*AsRef` API no longer exists.
- The construction-time routing means a genuinely pre-sync read still cannot use
  HybridQuery. The `globalConfig` Language carve-out remains until HybridQuery learns to
  **re-route when `syncList` changes** (so a query built pre-sync flips Dexie-first the
  moment its type registers). Tracked in `cms/src/components/content/todos.md`.
- Removing the `db.toRef`/`*AsRef` family is a breaking change to a **deprecated, internal**
  API. An exhaustive `cms/` + `app/` + `shared/` census confirmed no remaining caller
  before removal.
- Dexie-first group reads exposed a latent bug: `db.deleteRevoked()` over-purged the
  `docs` table on a transiently-empty `accessMap`. Fixed with an empty-map guard in
  `shared/src/db/database.ts` so Dexie-first reads don't see a half-purged cache.
- The HybridQuery test setup must seed the consumer's `syncList` (so synced types route
  Dexie-first under test); the CMS does this in `cms/vitest.setup.ts`.

## References

- Mechanism: `shared/src/util/HybridQuery/README.md`, `performance-notes.md`.
- Migration tracking and the remaining carve-outs: `cms/src/components/content/todos.md`.
- ADR 0016 (live updates via Sync2 + socket transport) and ADR 0017 (server-side response
  caching for hard-to-index content queries) — the live-update and API-supplement paths
  HybridQuery builds on.
