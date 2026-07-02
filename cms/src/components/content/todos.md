# TODOs

## Remaining

### PR #1714 pre-merge audit ([Ivan's comment](https://github.com/bccsa/luminary/pull/1714#issuecomment-4865882492))

Verdict: **not ready to merge** until the blockers below are done (+ dead-code sweep + API jest).

#### Must-fix before merge

- [ ] ~~**Server-FTS results silently pruned on browser-tab app** — `shared/src/fts/useFtsSearch.ts` + `shared/src/fts/ftsLiveSync.ts`: gate `watchDexie` prune to `source === 'local'`~~ (implemented)
- [ ] ~~**Clearing search wipes all filter/sort/tag/group state** — `cms/src/components/content/ContentOverview/FilterOptions.vue`: on empty search only set `queryOptions.value.search = ""`; keep `resetQueryOptions()` for the explicit reset button~~ (implemented)
- [ ] ~~**GroupGraph interaction inverted / dead** — `cms/src/components/groups/GroupOverview.vue`: `@open` → edit modal; `@select` → highlight only~~ (implemented)
- [ ] ~~**App user can deselect every language → no offline content** — `app/src/components/navigation/LanguageModal.vue`: disable removing the last language~~ (implemented)

#### Should-fix (medium)

- [ ] **`EditGroup` reads `props.groupQuery.liveData` that `toEditable` never returns** — `cms/src/components/groups/EditGroup.vue:78-83`
- [x] **GroupGraph `downstreamReach` is O(N²·E) on every ACL keystroke** — `cms/src/components/groups/GroupGraph/useGroupAccessGraph.ts`: precompute adjacency map
- [x] **Test coverage gaps:** `removeTarget()` stale-access sweep (`api/src/permissions/permissions.service.ts:429`); socket expired-Content stripping (`api/src/socketio.ts:232-238`); `config.cms → payload.cms` in HybridQuery (`shared/src/util/HybridQuery/HybridQuery.ts:112`); replace deleted `query.*.spec.ts` browse-path coverage

#### Cleanup — dead code & leftover artifacts

- [ ] Remove `cms/src/components/content/todos.md` from source (this file)
- [x] Remove `cms/src/components/content/lightPolish.ts` (dead alternate layout behind flag)
- [x] Remove orphaned `cms/src/components/navigation/ProfileMenu.vue` & `MobileSideBar.vue`; fix router still referencing removed `sandbox` route
- [x] Remove orphaned `api/src/validation/IsSortOptions.ts`
- [x] Update CMS specs still mocking removed `/search` + `x-query` (`useAuthProviders.spec`, `GroupOverview.spec`, `EditUser.spec`)
- [x] Remove unused deps `@vue-flow/minimap` + `@vue-flow/controls` in `cms/package.json`; dead `groups` prop on GroupGraph
- [ ] **Low-risk behaviour bugs:** socket patch reintroducing server-only `fts` into display docs; `cms/.../forms/LInput.vue` default `autocomplete` flipped `on`→`off`; `initLanguage` detached effectScope never stopped; `buildRedirects` duplicate on rapid second save

#### Backwards-compat / ops (confirm before merge)

- [ ] Confirm `/search` hard-removal is safe (API deploys after clients; no in-the-wild caller)
- [ ] Confirm v19 `CmsView` on `AuthProvider` for `group-public-users` is intended ops on existing prod DB (`api/src/db/schemaUpgrade/v19.ts:55`)

#### Verification

- [ ] Run API jest suite locally/CI (DB-dependent — not run in audit)

---

### Migrate consumers onto `toEditable.duplicate` / `toEditable.remove`

`toEditable` exposes generic `duplicate(id, modify?)` and `remove(id)`. Replace the hand-rolled
delete idiom (`deleteReq = 1; await nextTick(); save()`) with `remove(id)` where a `toEditable`
handle is in scope:

- ~~`cms/src/composables/useAuthProviders.ts` — `duplicateProvider` → `duplicate(id, clone => { … })`;~~
  ~~`confirmDelete` (deleteReq + nextTick + save) → `remove(id)`.~~ (implemented)
- ~~`cms/src/composables/useAutoGroupMappings.ts` — `deleteMapping` → `remove(id)`.~~ (implemented)
- ~~`cms/src/components/redirects/CreateOrEditRedirectModal.vue` — `deleteRedirect` → `remove`.~~ (implemented)
- ~~`cms/src/components/users/CreateOrEditUser.vue` — `deleteUser` → `remove`.~~ (implemented)
- ~~Content (`EditContent.vue` / `useEditContentSource.ts`) — parent `deleteParent` → `remove`;~~
  ~~translation delete-on-save → `remove` in `save()`.~~ (implemented)

Already migrated: `useAuthProviders.ts` (`duplicateProvider`, `confirmDelete`), `EditGroup.vue`
(`duplicateGroup`, `deleteGroup`), `useAutoGroupMappings.ts` (`deleteMapping`),
`CreateOrEditRedirectModal.vue` (`deleteRedirect`), `CreateOrEditUser.vue` (`deleteUser`), and
`EditContent.vue` / `useEditContentSource.ts` (`deleteParent`, translation delete-on-save via
`remove` in `save()`).

**Out of scope:** multi-doc content duplicate (`buildContentDuplicate` / `installClones` — cross-source,
reparenting, image-bucket duplication); non-`toEditable` deletes (`StorageOverview.vue`,
`EditLanguage.vue`); `deleteReq` used only as a UI staging flag (translation delete in
`EditContentValidation.vue`, confirm-dialog preview in `EditGroup.vue`).

Verify per file that the surrounding code holds a `toEditable` instance — some `deleteReq` toggles
(e.g. a confirm-dialog preview, as in `EditGroup.vue`) or non-`toEditable` deletes must NOT be
naively swapped.

### Include language selection (mangoIsPublished language selection logic) in sync.

Need to think it through a bit more before implementing
