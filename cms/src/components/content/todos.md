# TODOs

## ~~Add saving directly to `toEditable`~~ (DONE — follow-up below)

**Done:** `toEditable` now exposes `save(id)` (`shared/src/util/toEditable/toEditable.ts`)
— it routes the edited doc to local (`db.upsert`) or the API and calls `updateShadow` on
accept, so consumers no longer hand-roll the "upsert + re-baseline" dance.
`useEditContentSource.save()` already consumes it via `contentEditable.save(id)`.

### Remaining follow-up: migrate the deprecated wrappers onto the primitive

The two deprecated as-editable wrappers still keep their own copies of the save logic
instead of delegating to `toEditable.save`:

- `useDexieLiveQueryAsEditable.save(id)`
  (`shared/src/util/useDexieLiveQueryAsEditable/useDexieLiveQueryAsEditable.ts`) — still
  does its own `db.upsert(...)` + `updateShadow(id)`.
- `ApiLiveQueryAsEditable.save(id)`
  (`shared/src/util/ApiLiveQuery/ApiLiveQueryAsEditable.ts`) — still does its own
  `getRest().changeRequest(...)` + `updateShadow(id)` (incl. the `LFormData` upload-data path).

**Idea:** have both reuse `toEditable.save` rather than duplicate the upsert/changeRequest +
re-baseline. Confirm `toEditable.save`'s routing covers the API path
(`ApiLiveQueryAsEditable`) and the `LFormData` upload-data branch before swapping.

**Watch out for:**

- `toEditable` is generic over `BaseDocumentDto`; keep the save path doc-type-agnostic
  (no Content/Post/Tag specifics — those stay in the consumer).
- EditContent's `save()` also does redirect creation and skips delete-of-never-saved rows
  — that orchestration stays in the consumer; only the upsert + re-baseline primitive moves
  down. (The image/media upload writeback is now handled by `toEditable`'s `backPatchFields`.)

## Add an `isLoading` (loading) state to `HybridQuery`

**Status (not started):** `HybridQuery` exposes no loading/ready/error state — its only
public reactive member is `output: ShallowRef<T[]>`
(`shared/src/util/HybridQuery/HybridQuery.ts`), and `useHybridQuery` returns just that ref.
Routing/remote errors are only `console.error`'d internally, never surfaced. There is no
way for a consumer to tell "still fetching" from "fetched, genuinely empty".

**Why:** this blocks the migration above. `ApiLiveQuery` already provides this — an
`isLoading` ref (`true` until the first data/empty emission) via the `isLoading` getter
(plus a deprecated `isLoadingAsRef()`) in `shared/src/util/ApiLiveQuery/ApiLiveQuery.ts`.
Any call site that binds to `isLoading` (e.g. spinners / empty-state gating) loses that
signal when swapped to `useHybridQuery`.

**Idea:** add an `isLoading` ref (and likely an `error` ref) to `HybridQuery`, exposed
alongside `output` — `true` until the first window settles (local read resolves or the
remote route returns/falls back), then `false`. Decide how `useHybridQuery` surfaces it
since it currently returns only `output` (return an object, or an opt-in overload).

**Watch out for:**

- Define the semantics across both routes (local Dexie read vs. remote/offline fallback)
  and on rebuild — a query swap should re-enter loading, matching `ApiLiveQuery`.
- Keep `useHybridQuery`'s existing `ShallowRef<T[]>` return working, or migrate its
  call sites in lockstep (see the migration inventory below).

## Migrate `ApiLiveQuery` / `useDexieLiveQuery` (and derivatives) → `useHybridQuery`

All remaining CMS call sites below should be migrated to `useHybridQuery`. Inventory as of
this writing (call sites only — import/comment lines omitted). Re-grep before starting:
`grep -rn "ApiLiveQuery\|useDexieLiveQuery" cms/src --include=*.ts --include=*.vue`.

**`useDexieLiveQuery`** (13 call sites):

- `globalConfig.ts:99` — `_cmsLanguages`
- `composables/useAuthProviders.ts:23` — `groups`
- `composables/useAutoGroupMappings.ts:54` — `groups`
- `components/s3/StorageOverview.vue:26` — `groups`
- `components/content/EditContent.vue:315` — `isLocalChange` -> Move functionality to toEditable (as a queryable state)
- `components/content/EditContentBasic.vue:106` — `existingRedirectForSlug`
- `components/content/ContentOverview/ContentOverview.vue:167` — `groups`
- `components/content/ContentOverview/ContentOverview.vue:172` — `languages`
- `components/languages/EditLanguage.vue:57` — `original`
- `components/users/CreateOrEditUser.vue:131` — `groups`
- `components/users/CreateOrEditUser.vue:136` — `authProviders`
- `components/users/UserOverview.vue:67` — `groups`
- `components/authProvider/SelectionModal.vue:18` — `allProviders`
- ~~`pages/DashboardPage.vue:47` — `pendingChanges`~~ — **KEEP as `useDexieLiveQuery`.**
  Reads `db.localChanges` (the local-only outgoing change queue), not a synced doc table,
  so `useHybridQuery` doesn't apply. Excluded from this migration.

**`useDexieLiveQueryWithDeps`** (2 call sites):

- `components/content/TagSelector.vue:31` — `tags`
- `components/content/ContentOverview/ContentOverview.vue:152` — `tagContentDocs`

**`ApiLiveQuery`** (2 call sites):

- `components/users/CreateOrEditUser.vue:45` — `new ApiLiveQuery<UserDto>(userQuery)`
- `components/users/UserOverview.vue:32` — `new ApiLiveQuery<UserDto>(usersQuery)`

**`ApiLiveQueryAsEditable`** (groups feature — 1 instantiation, threaded as a prop):

- `components/groups/GroupOverview.vue:22` — `new ApiLiveQueryAsEditable<GroupDto>(...)`,
  passed as the `groupQuery` prop into `components/groups/GroupDisplayCard.vue:12` and
  `components/groups/EditGroup.vue:31` (and mocked in `EditGroup.spec.ts`). Blocked on the
  "migrate the deprecated wrappers onto the primitive" follow-up above.

**Note:** `main.ts:53-55` documents the socket handshake that keeps the transitional
live-only types (served by `ApiLiveQuery`) updating — remove that once the CMS finishes
this migration.

## ~~Add field-level back-patching to `toEditable`~~ (DONE)

**Done:** `ToEditableOptions` now exposes `backPatchFields: (keyof T)[]`
(`shared/src/util/toEditable/toEditable.ts`). On each source update, listed fields are copied
source → editable AND source → shadow even on user-edited docs, gated on the source field
diverging from the baseline (shadow) — so server-owned values keep flowing in without reading
as phantom-dirty, and an unsaved local edit to a field the source hasn't changed is preserved
(server-wins on a genuine divergence). `useEditContentSource` declares
`backPatchFields: ["imageData", "media"]` and the bespoke `waitForUpdate` `watch(parentSource, …)`
writeback is gone.

Future extension (not done): the same mechanism could declare server-set/derived fields
(`fts`, `ftsTokenCount`, `availableTranslations`, `parentTags`, …) on the content editable.
Deferred — those currently freeze on edit by design and changing that is a separate decision.
