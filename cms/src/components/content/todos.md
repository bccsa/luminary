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
`useContentBrowseQuery`, and `RedirectOverview` (all bind `isFetching`). `LanguageOverview` is the one
exception: it reads the **shared** `useDocsByType` ref (already populated by `globalConfig` at startup,
so even `isFetching`/any watch may have settled before mount) and resolves loading off a one-shot
`queryLocal(...)` instead.

## ~~Add field-level back-patching to `toEditable`~~ (DONE)

`ToEditableOptions.backPatchFields: (keyof T)[]` copies listed source fields → editable + shadow on
each source update (server-wins, gated on real divergence). `useEditContentSource` uses
`backPatchFields: ["imageData", "media"]`; the bespoke `waitForUpdate` writeback is gone.

## ~~Migrate `ApiLiveQuery` / `useDexieLiveQuery` (and derivatives) → `useHybridQuery`~~ (DONE, except exclusions)

All inventoried `useDexieLiveQuery` / `useDexieLiveQueryWithDeps` / `ApiLiveQuery<UserDto>` call
sites are migrated: `globalConfig` (`_cmsLanguages`), `useAuthProviders`, `useAutoGroupMappings`,
`StorageOverview`, `EditContentBasic` (redirect-by-slug, on the `[type+slug]` index),
`EditLanguage` (`original` + `languages`), `TagSelector`, `CreateOrEditUser`/`UserOverview`
(User → `useHybridQueryWithState`, API-only), `SelectionModal`, `storageSelection`,
`CreateOrEditRedirectModal`, `DashboardPage` (groups).

Also migrated the deprecated **`db.whereTypeAsRef(<Type>)`** reference-list reads (not in the
original inventory) → `useDocsByType` (see below): `UserDisplayCard`, `UserRow`,
`RedirectDisplaycard`, `ProfileMenu`, `LanguageModal`, `LanguageOverview`, `MediaEditor`.

### Shared-query composables
`cms/src/composables/useDocsByType.ts` — a memoized-singleton `useDocsByType<T>(type)` (one
**Dexie live query** per `DocType`, in a detached effect scope) so reference lists (groups,
languages, auth providers, storages) are read **once, app-wide** and shared by every consumer
(notably across list rows). It uses `useDexieLiveQuery`, **not** `useHybridQuery`, on purpose:
these are fully-synced types (always Dexie-first), and HybridQuery fixes its Dexie-vs-API routing
when the query is built — a synced query created before sync registers its type (e.g. globalConfig's
Language query at startup, before `initSync()`) would lock into API-only mode, hammer `/query`, and
never read Dexie. A plain Dexie live query has no such timing fragility.

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
