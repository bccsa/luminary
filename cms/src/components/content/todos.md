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
- `cms/src/components/users/CreateOrEditUser.vue` — `deleteUser` → `remove`.
- ~~Content (`EditContent.vue` / `useEditContentSource.ts`) — parent `deleteParent` → `remove`;~~
  ~~translation delete-on-save → `remove` in `save()`. Multi-doc duplicate stays out of scope.~~ (implemented)

Already migrated: `useAuthProviders.ts` (`duplicateProvider`, `confirmDelete`) and `EditGroup.vue`
(`duplicateGroup`, `deleteGroup`).

Note: in `CreateOrEditRedirectModal.vue` and `CreateOrEditUser.vue` the delete path sets
`deleteReq = 1` then falls through the shared `save()` (which itself branches on `deleteReq` for
notification copy / new-doc skip), so swapping in `remove(id)` means untangling that shared save —
not a naive substitution.

Verify per file that the surrounding code holds a `toEditable` instance — some `deleteReq` toggles
(e.g. a confirm-dialog preview, as in `EditGroup.vue`) or non-`toEditable` deletes
(`StorageOverview.vue`) must NOT be naively swapped.

### Include language selection (mangoIsPublished language selection logic) in sync.

Need to think it through a bit more before implementing
