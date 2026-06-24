# TODOs

## ~~Add saving directly to `toEditable`~~ (DONE)

`toEditable` exposes `save(id)` (`shared/src/util/toEditable/toEditable.ts`) — routes the edited
doc to local (`db.upsert`) or the API and calls `updateShadow` on accept. `useEditContentSource`,
`useAuthProviders`, and `useAutoGroupMappings` all consume it.

## ~~Add an `isLoading` (loading) state to `HybridQuery`~~ (DONE)

`HybridQuery` now exposes `isFetching: ComputedRef<boolean>` and `error: ShallowRef`
(`shared/src/util/HybridQuery/HybridQuery.ts`), and `useHybridQueryWithState(query, options)` returns
`{ output, isFetching, error }` for the same instance/lifecycle. The User screens
(`UserOverview`/`CreateOrEditUser`) bind to `isFetching` via `useHybridQueryWithState`.

**Loading-signal rule (consumer-side gotcha).** Drive `isLoading` off `isFetching`, **never** off a
fires-once `watch(output, …)`. HybridQuery dedupes no-op changes, so an empty result (`[] → []`) never
emits and such a watch hangs forever — this is the "stuck on Loading… when the query returns nothing"
bug (e.g. `audioPlaylists`/`autoGroupMappings` with no rows). Fixed at `useAutoGroupMappings`,
`useContentBrowseQuery`, `RedirectOverview`, and `LanguageOverview` — all bind `isFetching`.

## ~~Add field-level back-patching to `toEditable`~~ (DONE)

`ToEditableOptions.backPatchFields: (keyof T)[]` copies listed source fields → editable + shadow on
each source update (server-wins, gated on real divergence). `useEditContentSource` uses
`backPatchFields: ["imageData", "media"]`; the bespoke `waitForUpdate` writeback is gone.

## ~~Migrate `ApiLiveQuery` / `useDexieLiveQuery` (and derivatives) → `useHybridQuery`~~ (mostly DONE — stragglers in Remaining)

All inventoried `useDexieLiveQuery` / `useDexieLiveQueryWithDeps` / `ApiLiveQuery<UserDto>` call
sites are migrated — **except `globalConfig`'s `_cmsLanguages`, the deliberate Dexie carve-out
(see below + Remaining)**: `useAuthProviders`, `useAutoGroupMappings`, `StorageOverview`,
`EditContentBasic` (redirect-by-slug, on the `[type+slug]` index), `EditLanguage`
(`original` + `languages`), `TagSelector`, `CreateOrEditUser`/`UserOverview`
(User → `useHybridQueryWithState`, API-only), `SelectionModal`, `storageSelection`,
`CreateOrEditRedirectModal`, `DashboardPage` (groups).

Also migrated the deprecated **`db.whereTypeAsRef(<Type>)`** reference-list reads (not in the
original inventory) → direct `useHybridQuery`: `UserDisplayCard`, `UserRow`, `RedirectDisplaycard`,
`ProfileMenu`, `LanguageModal`, `LanguageOverview`, `MediaEditor`.

And the last content-domain reactive reads: `ContentOverview.vue` (`groups` + `languages` →
reference-list `useHybridQuery`; `tagContentDocs` → a reactive content `useHybridQuery` whose thunk
reads `cmsLanguageIdAsRef.value` + an in-memory `publishDate`-desc sort to avoid a `mangoToDexie`
sort-index warning) and `ContentDisplayCard.vue` (`contentDocs`, ex-`db.whereParentAsRef` →
`useHybridQuery({ type: Content, parentId })` — `parentId` is the discriminator and `{type+parentId}`
matches the existing `[type+parentId]` index, so no new index/full-table-scan warning).

### Reference-list reads: direct `useHybridQuery`, not a shared composable

Every reference-list read (groups, auth providers, storages, languages) calls `useHybridQuery(() =>
({ selector: { type } }), { live: true })` **directly at the point of use**. We briefly DRY'd these
into a memoized-singleton `useDocsByType` composable to share one subscription per type app-wide, but
removed it: HybridQuery freezes its Dexie-vs-API routing at **construction time** (it only
re-evaluates when the query _value_ changes — `HybridQuery.ts:428`), so hoisting construction into one
early shared singleton froze routing at the worst moment. Invoked directly in a component `setup`, the
query is always built **after** sync has registered its type, so it routes Dexie-first correctly.

**The one carve-out:** `globalConfig.initLanguage()` runs at **startup, before `initSync()`**, so it
can't use HybridQuery (it would lock API-only, hammer `/query`, and never read Dexie — the original
"languages not loading" bug). It keeps a direct **`useDexieLiveQuery`** for the Language list — which
is correct anyway, since languages are always fully synced.

> The shared-side fix that would let these reads share one subscription _and_ let `globalConfig` use
> HybridQuery too is tracked in **Remaining → "Move `globalConfig`'s startup Language read onto
> `HybridQuery`"**.

Local-change tracking lives in `luminary-shared` (`shared/src/util/useHasLocalChange/`): one shared
`localChanges.orderBy("docId").keys()` live query backs `useHasLocalChanges()` — a `(id) => boolean`
queryable exposed on `HybridQuery` / `useHybridQueryWithState().hasLocalChanges`. CMS reads it **only**
through that bundle: overviews pass `hasLocalChanges` down to their row cards (UserDisplayCard,
RedirectDisplaycard, LanguageDisplayCard, RedirectRow ← RedirectTable), and components with their own
query (ContentDisplayCard, EditLanguage, UserRow) read it off their own `useHybridQueryWithState`. No
CMS code calls a standalone local-change composable, and the per-doc `useHasLocalChange(id)`
convenience has been removed from shared (the CMS-side workaround was retired earlier).

`cms/src/util/groups.ts#assignableGroups` DRYs the Edit+Assign group filter.

### Excluded / kept (by design)

- The per-doc `db.isLocalChangeAsRef(id)` reads in display cards/rows now come from the
  `useHybridQueryWithState().hasLocalChanges` bundle queryable (above). `DashboardPage`
  `pendingChanges` (the local-only `localChanges` queue) is the one deliberate `useDexieLiveQuery`
  kept; everything else is migrated or tracked in **Remaining** — see the full-sweep status there.

## Remaining

### Full-sweep status (vs the PR goal: migrate reactive reads → `useHybridQuery`)

A complete `cms/src` grep for `useDexieLiveQuery(WithDeps)` / `ApiLiveQuery` / `db.*AsRef` /
`liveQuery` / `useObservable` confirms every reactive read still outside `useHybridQuery` is now
**migrated, intentional, or blocked**. The remaining non-HybridQuery reads are:
- `DashboardPage` `pendingChanges` — `useDexieLiveQuery` on the local-only `localChanges` queue
  (correct tool; HybridQuery only reads `db.docs` — below).
- `globalConfig` Language — `useDexieLiveQuery` pre-sync carve-out (shared-blocked — below).
- `ContentDisplayCard.vue` `db.whereParent(...)` — a **one-shot** `await` inside a `watch` deriving
  tag content, not a live/reactive read (and not the deprecated `whereParentAsRef`). Out of scope.

No `ApiLiveQuery` instances remain (only stale comments in `main.ts`/`UserOverview`/`CreateOrEditUser`).
The PR's read-migration goal is complete.

### ~~`GroupSelector` `whereTypeAsRef`~~ — DONE (last RxJS-backed read in the monorepo)
`components/groups/GroupSelector.vue` now reads groups via `useHybridQuery({ type: Group })`
(Dexie-first; the `deleteRevoked` over-purge fix makes that safe). This was the **single remaining
caller of any `db.toRef`-family method** (`whereTypeAsRef`/`getAsRef`/`whereParentAsRef`/… all route
through `db.toRef` → `@vueuse/rxjs` `useObservable` + `rxjs` `Observable` + Dexie `liveQuery`) across
`cms/` + `app/` + `shared/`. With it gone, **no consumer uses the RxJS-backed `db.*AsRef` API**.

> **Unblocks a shared cleanup (senior):** the `toRef`/`getAsRef`/`whereTypeAsRef`/`whereParentAsRef`/
> `tagsWhereTagTypeAsRef`/`contentWhereTagAsRef`/`isLocalChangeAsRef` family in
> `shared/src/db/database.ts` is now dead, and `@vueuse/rxjs` + `rxjs` (used **only** by `db.toRef`)
> can be dropped from `shared/package.json`. `useHybridQuery`/`useDexieLiveQuery` subscribe to Dexie's
> `liveQuery` directly and need neither.

### `DashboardPage.vue` `pendingChanges` → `useHybridQuery` (needs shared `localChanges` support)

`pages/DashboardPage.vue:47` reads the **`localChanges`** table (the local outgoing edit queue), not
the synced `docs` table. `useHybridQuery` only queries `db.docs` via Mango selectors and has no
`localChanges` source, so it cannot read this today. Two paths:

1. **Recommended:** keep on `useDexieLiveQuery` — `localChanges` is local-only, so HybridQuery's
   API-supplement/socket machinery is meaningless here; `useDexieLiveQuery` is the correct tool.
2. **Only path to literal "HybridQuery everywhere":** add a `localChanges`-queue read mode to
   `HybridQuery` in `shared/` — questionable (conflates the synced-doc abstraction with the local
   queue). **Blocked:** `shared/` is the senior's.
   Unless (2) lands, this stays an intentional, documented `useDexieLiveQuery`.

### Move `globalConfig`'s startup Language read onto `HybridQuery`

`globalConfig.initLanguage()` reads the Language list with a direct **`useDexieLiveQuery`** (not
`useHybridQuery`) because it runs at startup, _before_ `initSync()` has registered `language` in the
sync engine's `syncList` — and `HybridQuery` freezes its Dexie-vs-API routing at construction time
(`HybridQuery.ts:428`, only re-evaluated on a query-_value_ change). A HybridQuery built that early
would lock into API-only mode and never read Dexie (the original "languages not loading" + `/query`
storm). The Dexie read is correct today (languages are always fully synced), but it's the lone
inconsistency on the "HybridQuery everywhere" branch and should be addressed.

The real fix is shared-side: make `HybridQuery` **re-route when `syncList` changes** (so a query
built pre-sync flips Dexie-first the moment its type registers), and optionally **memoize identical
queries** so the direct reference-list reads can also share one subscription. Once that lands,
`globalConfig` — and every direct `useHybridQuery(() => ({ selector: { type } }))` reference-list read
— can drop to a single safe, shared pattern. **Blocked:** `shared/` is the senior's right now.

### ~~Move local-change tracking into `HybridQuery`; retire `useHasLocalChange`~~ — DONE

Local-change tracking lives in `luminary-shared` (`shared/src/util/useHasLocalChange/`): a single
shared `localChanges.orderBy("docId").keys()` live query backs `useHasLocalChanges()` — a
`(id) => boolean` queryable exposed on the `HybridQuery` class and the `useHybridQueryWithState`
bundle as `hasLocalChanges`. `toEditable` no longer owns the tracking, and the CMS-side
`useHasLocalChange.ts` workaround is deleted. CMS components now read `hasLocalChanges` **off the
`useHybridQueryWithState` bundle** — overviews thread it to their row cards (UserDisplayCard,
RedirectDisplaycard, LanguageDisplayCard, and RedirectRow via RedirectTable), while components with
their own query (ContentDisplayCard, EditLanguage, UserRow) read it off that query's bundle. The
per-doc `useHasLocalChange(id)` convenience was unused after this and has been **removed from shared**
(`useHasLocalChanges()` — the queryable `HybridQuery` uses internally — stays).

### Migrate the deprecated as-editable wrappers onto `toEditable.save`

`useDexieLiveQueryAsEditable.save(id)` and `ApiLiveQueryAsEditable.save(id)` still hand-roll
`db.upsert`/`getRest().changeRequest` + `updateShadow` instead of delegating to `toEditable.save`.
Confirm `toEditable.save` covers the API path + the `LFormData` upload-data branch before swapping.
Keep the save path doc-type-agnostic (no Content/Post/Tag specifics).

### Groups vanish from the Group overview — `deleteRevoked()` over-purge (shared) — ✅ FIXED

**Symptom:** after `GroupOverview.vue` switched its groups read to `useHybridQuery` (Dexie-first for
the synced Group type), most groups vanished — only locally-"duplicated" groups remained. Intermittent.

**Root cause (confirmed):** the switch _exposed_ a pre-existing shared bug. `ApiLiveQuery` read groups
from the REST API and masked it; Dexie-first `useHybridQuery` reflects the `docs` table, which
`db.deleteRevoked()` purges:

- `watchValue(accessMap, () => db.deleteRevoked(), { immediate: true })` fired on init while `accessMap`
  was still the empty `useLocalStorage` default (`permissions.ts:12`), before the socket `clientConfig`
  populated it.
- empty map → `getAccessibleGroups(View)[Group]` = `[]` → `whereNotMemberOfAsCollection([], Group)`
  matched _every_ group with an `acl` field → all deleted from `docs`.
- `deleteRevoked()` never resets `syncList` (group block stays `eof`) → sync never re-fetched →
  **permanent** loss. Locally-duplicated groups survived via the `localChanges` queue. Intermittent
  because it depended on whether `accessMap` was empty/stale at the `deleteRevoked` tick.

**Fix (shipped in `shared/src/db/database.ts`):** the `accessMap` watcher now guards
`if (Object.keys(value).length === 0) return;` (empty = "not loaded yet", not "no access"; logout uses
`purge()`), the `{ immediate: true }` was dropped, and a one-time group-`syncList` reset
(`resetGroupSyncListForRecovery`, localStorage-gated `groupSyncListReset_v1`) recovers already-purged
clients on next sync. The recovery is temporary — remove after 2026-09-01, tracked by bccsa/luminary#1730.
Ruled out: HybridQuery read/merge (merges by `_id`), ingestion filters, and the construction-time routing
issue (that would lock API-only → groups would still _show_). No CMS-side change was needed.

### `GroupOverview` `ApiLiveQueryAsEditable<GroupDto>`

`components/groups/GroupOverview.vue` (the as-editable wrapper) — owned by another team member;
blocked on the wrapper follow-up above. (`GroupSelector`'s read is now migrated — see DONE above.)

### Remove the transitional socket handshake

`main.ts:53-55` keeps `User` + `AutoGroupMappings` in the init `syncList` only so the socket pushes
updates for the (now-`HybridQuery`, API-only) live-only types. Remove once those screens are verified
live (HybridQuery subscribes to the rooms on demand).

### Pre-existing issues surfaced during the `hasLocalChanges` move (NOT caused by it)

Both reproduce identically at HEAD (verified by stashing the move and re-running) — recording them
here so they aren't mistaken for regressions from this work.

- **`components/groups/EditGroup.spec.ts` — type error + 3 failing tests.** The prop is typed
  `groupQuery: ReturnType<typeof toEditable<GroupDto>>` (public `updateShadow`), but the spec passes
  `mockGroupQuery as ApiLiveQueryAsEditable<GroupDto>`, whose `updateShadow` is `private` → not
  structurally assignable (`vue-tsc` error). Before this change `vue-tsc` reported the missing
  `hasLocalChanges` member first; removing it from `toEditable` just shifted the reported reason to
  `updateShadow`. The 3 runtime failures ("calls duplicate function…", "displays EditAclByGroup
  components…", "removes an assigned group…") are mount/render failures unrelated to local-change
  state. Belongs with the `GroupOverview` / as-editable-wrapper follow-up above (another team member).

- **`components/content/EditContent.spec.ts` — unhandled rejection in lodash `equalByTag`.**
  `toEditable`'s `isEqualBase` deep-compares docs carrying binary upload data; lodash reaches
  `ArrayBuffer.prototype.byteLength` through a Vue reactive proxy and throws "called on incompatible
  receiver". `arrayBufferCustomizer` (`shared/src/util/toEditable/toEditable.ts`) already try/catches
  the customizer path, but the rejection still surfaces as unhandled. Tests pass; the equality logic
  is untouched by this change.

- **`components/groups/GroupOverview.spec.ts` — 3 failing tests (another team member's).** The spec
  mocks a `/search` API returning all four groups but seeds only `Super Admins` into Dexie, then
  asserts all four render and that the API was queried (`mockApiRequest`). Since `GroupOverview`
  migrated to `useHybridQuery` (Dexie-first for the synced `Group` type), it reads Dexie and never
  hits the mocked API — so only `Super Admins` renders and `mockApiRequest` stays `undefined`. The
  spec was not updated alongside that migration (seed all four groups into Dexie, or assert the
  Dexie-first read). Lives with the `GroupOverview` follow-up above. Fails identically at HEAD,
  independent of the sidebar/`LTeleport` work.

### `deleteCmd:group` & `deleteCmd:storage` syncList entries pinned at `blockStart:0 / blockEnd:0` (shared) — BLOCKED on senior

**Symptom:** the `luminaryInternals.syncList` record shows `deleteCmd:group` and `deleteCmd:storage`
at `blockStart: 0, blockEnd: 0` (`eof: true`), while every other chunkType carries a real
`blockStart` (`blockEnd: 0` is normal — it's the "oldest" floor). The captured list also has **no
base `group` / `storage` entry**, only their `deleteCmd:*` siblings — the tell that both base columns
synced **zero documents**.

**Root cause (verified in code, all in `shared/src/api/sync/`):** the `0/0` is produced whenever a
base-type _initial_ sync returns zero docs:

1. `syncBatch.ts:171-198` pushes a `syncList` entry **only when `fetchedDocs.length > 0`** — an empty
   result records nothing (the lines 153-168 that compute boundaries for the empty case are dead
   because the push is gated on `fetchedDocs.length`).
2. `merge.ts:63-64` — `mergeVertical` returns `{ blockStart: 0, blockEnd: 0 }` for an empty
   `filteredList`; `syncBatch.ts:204-211` then forces `eof: true` and returns
   `{ eof:true, blockStart:0, blockEnd:0, firstSync:true }`.
3. `sync.ts:478-487` seeds the `deleteCmd:<type>` entry from that result → inherits `0/0, eof:true`;
   and because `firstSync === true`, the `deleteCmd` REST catch-up at `sync.ts:493-499` is skipped.

**Why group/storage specifically:** `storage` — most DBs have no `Storage` docs in the user's groups,
so the base storage sync (`cms/src/sync.ts:201`) returns zero (near-universal). `group` — base group
sync (`cms/src/sync.ts:188`) queries `type:group, memberOf $elemMatch $in access[Group]`; group docs
carry `memberOf=[self._id]` (`api/.../processGroupDto.ts:8`) and `access[Group]` comes from
`getAccessibleGroups(View)` (`shared/.../permissions.ts:55`) — when that returns zero rows the same
chain fires.

**Impact (beyond cosmetic):** the unrecorded base column keeps `firstSync` perpetually true, so the
`deleteCmd` REST catch-up never runs — group/storage **deletions can fail to propagate on REST
resync** (only live socket pushes carry them).

**Reproduction:**

- _Deterministic (regression test to add):_ new additive `shared/src/api/sync/emptyColumnSeed.spec.ts`
  using the **real** `syncBatch`/`merge`/`utils` (do NOT `vi.mock` them as `sync.spec.ts` does — that
  hides the bug); mock only `../../db/database` + inject an http service whose `post` returns
  `{ docs: [] }` via `initSync(http)`; assert `deleteCmd:group`/`deleteCmd:storage` are NOT seeded at
  `0/0`. Fails today; the guard after the fix.
- _Runtime:_ fresh CMS IndexedDB (delete the `luminary-*` DB), log in, select a CMS language, let
  initial sync finish, then inspect `luminaryInternals → syncList → value` → `deleteCmd:storage`
  (and `deleteCmd:group` if group sync returned zero) at `0/0` with no base entry.

**Fix (depth = senior's call; `shared/` is the senior's):**

- _Minimal:_ at `sync.ts:478` (or `merge.ts:63-64`) seed the `deleteCmd` with the verified queried
  frontier instead of `0/0` — fixes the value + stops `mergeVertical` treating it as legacy-empty.
- _Full (recommended):_ also record the **empty base column** in `syncBatch` (push an `eof:true` entry
  with the queried boundaries when an initial sync returns zero docs) so `firstSync` stops being
  perpetually true and the `deleteCmd` REST catch-up runs — fixes delete propagation, not just the
  display. Needs a frontier marker that doesn't poison horizontal-merge/trim.

Full writeup: `~/.claude/plans/id-synclist-value-array-14-cosmic-panda.md`.

### memberOf field missing in groupDto seeding docs

### Database upgrades scripts not running on newly seeded CouchDB database
