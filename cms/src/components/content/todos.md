# TODOs

## Remaining

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
