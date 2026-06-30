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

### Remove the transitional socket handshake

`main.ts:57` keeps `User` + `AutoGroupMappings` in the init `syncList` only so the socket pushes
updates for the (now-`HybridQuery`, API-only) live-only types. Remove once those screens are verified
live (HybridQuery subscribes to the rooms on demand).

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