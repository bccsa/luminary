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

## ~~Migrate `ApiLiveQuery` / `useDexieLiveQuery` (and derivatives) → `useHybridQuery`~~ (DONE, except exclusions)

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

`cms/src/composables/useHasLocalChange.ts` — `useHasLocalChange(id)` shares one
`localChanges.orderBy("docId").keys()` live query (same mechanism `toEditable` uses internally),
replacing the deprecated per-call `db.isLocalChangeAsRef(id)` in the display cards/rows. **Temporary
consumer-side workaround** — this tracking should move into `HybridQuery` itself and the composable be
retired (see Remaining → "Move local-change tracking into `HybridQuery`").

`cms/src/util/groups.ts#assignableGroups` DRYs the Edit+Assign group filter.

### Excluded / kept (by design)
- **`pages/DashboardPage.vue` `pendingChanges`** — reads the whole local-only `localChanges` queue
  (a list), not a synced doc table, so `useHybridQuery` doesn't apply. Kept on `useDexieLiveQuery`.
  (The per-doc `db.isLocalChangeAsRef(id)` reads in the display cards/rows are now consolidated onto
  `useHasLocalChange` — see above.)
- **`components/content/ContentOverview/ContentOverview.vue`** (`groups`, `languages`,
  `tagContentDocs`) — intentionally not migrated yet.

## Remaining

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

### Move local-change tracking into `HybridQuery`; retire `useHasLocalChange`
`cms/src/composables/useHasLocalChange.ts` is a **temporary CMS-side workaround**: it stands up its
own shared `localChanges.orderBy("docId").keys()` live query and exposes `useHasLocalChange(id)` so
list rows/cards can show a "has local changes" badge. This re-implements, in the consumer, the exact
local-change mechanism `toEditable` already runs internally — and it doesn't belong here.

The local-change state should be tracked **inside `HybridQuery`** (`shared/src/util/HybridQuery/`), so
every hybrid-query result exposes per-doc local-change state directly (no separate composable, one
shared subscription owned by the query layer). Once that lands, delete `useHasLocalChange` and have
`UserDisplayCard`, `UserRow`, `RedirectDisplaycard`, `RedirectRow`, `ContentDisplayCard`,
`LanguageDisplayCard`, and `EditLanguage` read the local-change state off the HybridQuery result.
**Blocked:** `shared/` is currently owned by the senior — keep this consumer-side until that opens up.

### Migrate the deprecated as-editable wrappers onto `toEditable.save`
`useDexieLiveQueryAsEditable.save(id)` and `ApiLiveQueryAsEditable.save(id)` still hand-roll
`db.upsert`/`getRest().changeRequest` + `updateShadow` instead of delegating to `toEditable.save`.
Confirm `toEditable.save` covers the API path + the `LFormData` upload-data branch before swapping.
Keep the save path doc-type-agnostic (no Content/Post/Tag specifics).

### `GroupOverview` `ApiLiveQueryAsEditable<GroupDto>` (+ `GroupSelector` `whereTypeAsRef`)
`components/groups/*` — owned by another team member; blocked on the wrapper follow-up above.

### Remove the transitional socket handshake
`main.ts:53-55` keeps `User` + `AutoGroupMappings` in the init `syncList` only so the socket pushes
updates for the (now-`HybridQuery`, API-only) live-only types. Remove once those screens are verified
live (HybridQuery subscribes to the rooms on demand).
