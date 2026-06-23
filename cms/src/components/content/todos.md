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
re-evaluates when the query *value* changes — `HybridQuery.ts:428`), so hoisting construction into one
early shared singleton froze routing at the worst moment. Invoked directly in a component `setup`, the
query is always built **after** sync has registered its type, so it routes Dexie-first correctly.

**The one carve-out:** `globalConfig.initLanguage()` runs at **startup, before `initSync()`**, so it
can't use HybridQuery (it would lock API-only, hammer `/query`, and never read Dexie — the original
"languages not loading" bug). It keeps a direct **`useDexieLiveQuery`** for the Language list — which
is correct anyway, since languages are always fully synced.

> The shared-side fix that would let these reads share one subscription *and* let `globalConfig` use
> HybridQuery too is tracked in **Remaining → "Move `globalConfig`'s startup Language read onto
> `HybridQuery`"**.

Local-change tracking now lives in `luminary-shared` (`shared/src/util/useHasLocalChange/`): one
shared `localChanges.orderBy("docId").keys()` live query backs both `useHasLocalChanges()` (a
`(id) => boolean` queryable, exposed on `HybridQuery` / `useHybridQueryWithState`) and the per-doc
`useHasLocalChange(id)`. The display cards/rows import `useHasLocalChange` straight from
`luminary-shared`; the CMS-side `useHasLocalChange.ts` workaround has been retired and `toEditable`
no longer owns the tracking (see the now-done "Move local-change tracking into `HybridQuery`" below).

`cms/src/util/groups.ts#assignableGroups` DRYs the Edit+Assign group filter.

### Excluded / kept (by design)
- The per-doc `db.isLocalChangeAsRef(id)` reads in display cards/rows are consolidated onto
  `useHasLocalChange` (above). That is the only deliberate "kept" item. Everything else that still
  reads outside `useHybridQuery` (ContentOverview, ContentDisplayCard, DashboardPage `pendingChanges`)
  is now tracked in **Remaining** with a migration plan — see the full-sweep status there.

## Remaining

### Full-sweep status (vs the PR goal: migrate reactive reads → `useHybridQuery`)
A complete `cms/src` grep for `useDexieLiveQuery(WithDeps)` / `ApiLiveQuery` / `db.*AsRef` /
`liveQuery` / `useObservable` confirms every reactive read still outside `useHybridQuery` is now
**intentional or blocked**: `DashboardPage` `pendingChanges` (local-only queue — below), the
`globalConfig` Language carve-out and `useHasLocalChange` (both shared-blocked — below), and
`GroupSelector.vue`'s `whereTypeAsRef` (`components/groups/*` — another team member's, under the
GroupOverview item). No other live-query mechanism is in use. `ContentOverview.vue` and
`ContentDisplayCard.vue` are now migrated (DONE section above). The PR's read-migration goal is
complete except those intentional/blocked items.

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
`useHybridQuery`) because it runs at startup, *before* `initSync()` has registered `language` in the
sync engine's `syncList` — and `HybridQuery` freezes its Dexie-vs-API routing at construction time
(`HybridQuery.ts:428`, only re-evaluated on a query-*value* change). A HybridQuery built that early
would lock into API-only mode and never read Dexie (the original "languages not loading" + `/query`
storm). The Dexie read is correct today (languages are always fully synced), but it's the lone
inconsistency on the "HybridQuery everywhere" branch and should be addressed.

The real fix is shared-side: make `HybridQuery` **re-route when `syncList` changes** (so a query
built pre-sync flips Dexie-first the moment its type registers), and optionally **memoize identical
queries** so the direct reference-list reads can also share one subscription. Once that lands,
`globalConfig` — and every direct `useHybridQuery(() => ({ selector: { type } }))` reference-list read
— can drop to a single safe, shared pattern. **Blocked:** `shared/` is the senior's right now.

### ~~Move local-change tracking into `HybridQuery`; retire `useHasLocalChange`~~ — DONE
Local-change tracking now lives in `luminary-shared` (`shared/src/util/useHasLocalChange/`): a single
shared `localChanges.orderBy("docId").keys()` live query backs `useHasLocalChanges()` — a
`(id) => boolean` queryable exposed on the `HybridQuery` class and `useHybridQueryWithState` bundle —
and the per-doc `useHasLocalChange(id)` convenience. `toEditable` no longer owns the tracking, the
CMS-side `useHasLocalChange.ts` workaround is deleted, and `UserDisplayCard`, `UserRow`,
`RedirectDisplaycard`, `RedirectRow`, `ContentDisplayCard`, `LanguageDisplayCard`, and `EditLanguage`
now import `useHasLocalChange` from `luminary-shared`.

### Migrate the deprecated as-editable wrappers onto `toEditable.save`
`useDexieLiveQueryAsEditable.save(id)` and `ApiLiveQueryAsEditable.save(id)` still hand-roll
`db.upsert`/`getRest().changeRequest` + `updateShadow` instead of delegating to `toEditable.save`.
Confirm `toEditable.save` covers the API path + the `LFormData` upload-data branch before swapping.
Keep the save path doc-type-agnostic (no Content/Post/Tag specifics).

### Groups vanish from the Group overview — *suspected* `deleteRevoked()` over-purge (shared)
**Symptom:** after `GroupOverview.vue` switched its groups read to `useHybridQuery` (Dexie-first for
the synced Group type), most groups vanished — only locally-"duplicated" groups remained. Intermittent.

**Likely cause (confirmed by code-reading; NOT yet fixed/verified — treat as the leading hypothesis):**
the switch *exposed* a pre-existing shared bug. `ApiLiveQuery` read groups from the REST API and masked
it; Dexie-first `useHybridQuery` reflects the `docs` table, which `db.deleteRevoked()` purges:
- `database.ts:878` `watchValue(accessMap, () => db.deleteRevoked(), { immediate: true })` fires on init
  while `accessMap` is still the empty `useLocalStorage` default (`permissions.ts:12`), before the
  socket `clientConfig` populates it.
- empty map → `getAccessibleGroups(View)[Group]` = `[]` → `whereNotMemberOfAsCollection([], Group)`
  (`database.ts:721-728`) matches *every* group with an `acl` field → all deleted from `docs`.
- `deleteRevoked()` never resets `syncList` (group block stays `eof`) → sync never re-fetches →
  **permanent** loss. Locally-duplicated groups survive via the `localChanges` queue. Intermittent
  because it depends on whether `accessMap` is empty/stale at the `deleteRevoked` tick.

**Suspected fix (shared, blocked — senior's):** guard `deleteRevoked()` with
`if (Object.keys(accessMap.value).length === 0) return;` (empty = "not loaded yet", not "no access";
logout uses `purge()`), drop `{ immediate: true }`, and add a one-time group-`syncList` reset to recover
already-purged clients. Ruled out: HybridQuery read/merge (merges by `_id`), ingestion filters, and the
construction-time routing issue (that would lock API-only → groups would still *show*). The
Group-visibility rule matches the API (`memberOf=[self._id]`), so the empty-map guard is the whole fix.
CMS-side interim if needed: revert GroupOverview's groups read to `ApiLiveQuery`.

### `GroupOverview` `ApiLiveQueryAsEditable<GroupDto>` (+ `GroupSelector` `whereTypeAsRef`)
`components/groups/*` — owned by another team member; blocked on the wrapper follow-up above.

### Remove the transitional socket handshake
`main.ts:53-55` keeps `User` + `AutoGroupMappings` in the init `syncList` only so the socket pushes
updates for the (now-`HybridQuery`, API-only) live-only types. Remove once those screens are verified
live (HybridQuery subscribes to the rooms on demand).
