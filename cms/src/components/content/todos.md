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
- EditContent's `save()` also does upload-writeback bookkeeping (`waitForUpdate`),
  redirect creation, and skips delete-of-never-saved rows — that orchestration stays in
  the consumer; only the upsert + re-baseline primitive moves down.

## Migrate `ApiLiveQuery` / `useDexieLiveQuery` (and derivatives) → `useHybridQuery`

All remaining CMS call sites below should be migrated to `useHybridQuery`. Inventory as of
this writing (call sites only — import/comment lines omitted). Re-grep before starting:
`grep -rn "ApiLiveQuery\|useDexieLiveQuery" cms/src --include=*.ts --include=*.vue`.

**`useDexieLiveQuery`** (13 call sites):

- `globalConfig.ts:99` — `_cmsLanguages`
- `composables/useAuthProviders.ts:23` — `groups`
- `composables/useAutoGroupMappings.ts:54` — `groups`
- `components/s3/StorageOverview.vue:26` — `groups`
- `components/content/EditContent.vue:315` — `isLocalChange`
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

## Add field-level back-patching to `toEditable`

`toEditable` currently patches the editable from the source **only when the user hasn't
edited that doc** — once any field is edited, the whole doc is frozen against incoming
source updates (to avoid clobbering in-progress edits). We need a way to opt specific
fields **into** back-patching so they always track the source, even on an edited doc.

**Why:** some fields are server-owned / out-of-band and must keep flowing in regardless
of local edits:

- Server-processed upload results — `imageData` / `media` after an upload completes.
  EditContent currently hand-rolls this in `useEditContentSource` (the `waitForUpdate`
  `watch(parentSource, …)` that copies `imageData`/`media` onto the editable element and
  re-baselines). This is exactly the back-patch pattern, done manually for two fields.
- Server-set/derived fields (`fts`, `ftsTokenCount`, `availableTranslations`,
  `parentTags`, …) that the user never edits but the source keeps updating.

**Idea:** let `toEditable` take an option like `backPatchFields: (keyof T)[]` (or a
predicate). On each source update, for edited docs, still skip the user-edited fields but
copy the listed fields from source → editable (and into the shadow so they don't read as
dirty). Then EditContent can drop the bespoke `imageData`/`media` writeback watch and just
declare those fields.

**Watch out for:**

- Keep it doc-type-agnostic in `toEditable`; the field list is supplied by the consumer.
- Back-patched fields must also update the shadow, or they'll show up as phantom dirty.
- Don't back-patch a field the user is actively editing — decide precedence (server vs.
  local) per field; the upload-result case is "server wins", but that won't hold for
  every field.
