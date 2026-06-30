# TODOs

## Remaining

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

### Migrate consumers onto `toEditable.duplicate` / `toEditable.remove`

`toEditable` now exposes generic `duplicate(id, modify?)` and `remove(id)`. Replace the hand-rolled
clone (`_.cloneDeep(toRaw)` + `db.uuid()` + `delete _rev` + push) and delete
(`deleteReq = 1; await nextTick(); save()`) idioms where a `toEditable` handle is in scope:

- `cms/src/composables/useAuthProviders.ts` — `duplicateProvider` → `duplicate(id, clone => { … })`;
  `confirmDelete` (deleteReq + nextTick + save) → `remove(id)`.
- `cms/src/composables/useAutoGroupMappings.ts` — `deleteMapping` → `remove(id)`.
- `cms/src/components/groups/EditGroup.vue` — `duplicateGroup` → `duplicate` + `save`; `deleteGroup` → `remove`.
- `cms/src/components/redirects/CreateOrEditRedirectModal.vue` — `deleteRedirect` → `remove`.
- `cms/src/components/users/CreateOrEditUser.vue` — `deleteUser` → `remove`.
- Content (`EditContent.vue` / `useEditContentSource.ts`) — the multi-doc parent+children duplicate
  via `buildContentDuplicate`/`installClones` is out of scope (cross-source, reparenting,
  image-bucket duplication); only the single-doc `deleteReq` paths are candidates for `remove`.

Verify per file that the surrounding code holds a `toEditable` instance — some `deleteReq` toggles
(e.g. a confirm-dialog preview) or non-`toEditable` deletes (`StorageOverview.vue`) must NOT be
naively swapped. `duplicate` stages the clone (returns it, does not save); for an immediate-save
flow do `const c = duplicate(id); if (c) await save(c._id)`.

### ~~Remove the transitional socket handshake~~ (RESOLVED)

`main.ts` no longer keeps `User` + `AutoGroupMappings` in the init `syncList` — the `init()`
config no longer takes a sync list at all (`config.syncList` / `ApiSyncQuery` were removed).
Those live-only types are served by `HybridQuery` in API-only mode, which subscribes to their
socket rooms on demand (and re-joins on reconnect). The connect handshake event itself was also
renamed `joinSocketGroups` → `clientConfigReq` (it bootstraps the connection — delivers the
accessMap and declares CMS mode — rather than "joining groups"); the API keeps `joinSocketGroups`
as a deprecated alias for backwards compat (ADR 0005).

**Future:** the whole Socket.io live-update transport should migrate to Server-Sent Events (SSE)
when SSE is implemented — see #1740.

### ~~Stale test failures from the `GroupOverview` / `hasLocalChanges` migrations~~ (RESOLVED)

- `EditGroup.spec.ts` / `GroupOverview.spec.ts` — already updated for the `useHybridQuery`/`toEditable`
  migration; both pass at HEAD.
- `EditContentValidation.vue`'s `isContentDirty` now uses `_.isEqualWith` with an ArrayBuffer customizer
  (mirrors `EditContentParent.vue`), so the deep-compare no longer throws on `imageData`/`parentImageData`
  buffers.
- The remaining full-run breaker was 21 `el.scrollIntoView is not a function` unhandled rejections from
  `LDropdown` (jsdom doesn't implement `scrollIntoView`) — stubbed in `vitest.setup.ts`. Full suite is green.

### Include language selection (mangoIsPublished language selection logic) in sync.

Need to think it through a bit more before implementing