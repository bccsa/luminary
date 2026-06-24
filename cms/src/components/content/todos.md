# TODOs

## Remaining

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

### Migrate the deprecated as-editable wrappers onto `toEditable.save`

`useDexieLiveQueryAsEditable.save(id)` and `ApiLiveQueryAsEditable.save(id)` still hand-roll
`db.upsert`/`getRest().changeRequest` + `updateShadow` instead of delegating to `toEditable.save`.
Confirm `toEditable.save` covers the API path + the `LFormData` upload-data branch before swapping.
Keep the save path doc-type-agnostic (no Content/Post/Tag specifics).

### Remove the transitional socket handshake

`main.ts:57` keeps `User` + `AutoGroupMappings` in the init `syncList` only so the socket pushes
updates for the (now-`HybridQuery`, API-only) live-only types. Remove once those screens are verified
live (HybridQuery subscribes to the rooms on demand).

### Stale test failures from the `GroupOverview` / `hasLocalChanges` migrations

The `GroupOverview` read migrated to `useHybridQuery`/`toEditable`, but its specs were not updated
alongside. All reproduce at HEAD (verified by stashing the work and re-running) — recording them so
they aren't mistaken for regressions.

- **`components/groups/EditGroup.spec.ts` — type error + 3 failing tests.** The prop is typed
  `groupQuery: ReturnType<typeof toEditable<GroupDto>>` (public `updateShadow`), but the spec still
  passes `mockGroupQuery as ApiLiveQueryAsEditable<GroupDto>` (private `updateShadow`) → not
  structurally assignable (`vue-tsc` error). The 3 runtime failures ("calls duplicate function…",
  "displays EditAclByGroup components…", "removes an assigned group…") are mount/render failures
  unrelated to local-change state. Update the spec to pass a `toEditable<GroupDto>` mock.

- **`components/groups/GroupOverview.spec.ts` — 3 failing tests.** The spec mocks a `/search` API
  returning all four groups but seeds only `Super Admins` into Dexie, then asserts all four render
  and that the API was queried (`mockApiRequest`). Since `GroupOverview` migrated to `useHybridQuery`
  (Dexie-first for the synced `Group` type), it reads Dexie and never hits the mocked API — so only
  `Super Admins` renders and `mockApiRequest` stays `undefined`. Update the spec (seed all four
  groups into Dexie, or assert the Dexie-first read).

- **`components/content/EditContent.spec.ts` — unhandled rejection in lodash `equalByTag`.**
  `toEditable`'s `isEqualBase` deep-compares docs carrying binary upload data; lodash reaches
  `ArrayBuffer.prototype.byteLength` through a Vue reactive proxy and throws "called on incompatible
  receiver". `arrayBufferCustomizer` (`shared/src/util/toEditable/toEditable.ts`) already try/catches
  the customizer path, but the rejection still surfaces as unhandled. Tests pass; pre-existing.

### memberOf field missing in groupDto seeding docs

### Database upgrades scripts not running on newly seeded CouchDB database
