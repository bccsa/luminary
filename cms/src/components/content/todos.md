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
  Symptom: a flaky `TypeError: Method get ArrayBuffer.prototype.byteLength called on incompatible
receiver` surfaces as an unhandled rejection under the full (parallel) run; it passes in isolation.
  Root cause: `EditContentValidation.vue`'s `isContentDirty` computed deep-compares content with a
  plain `_.isEqual` and only strips `parentMedia` before comparing. `ContentDto` also carries
  `parentImageData` (plus `imageData`/`media`), which hold `uploadData[].fileData: ArrayBuffer`. Plain
  `_.isEqual` recurses into that buffer — reached through a Vue reactive proxy — and lodash's
  `byteLength` access throws. Because it runs inside a reactive `computed`, the throw escapes as an
  unhandled rejection. Fix: use `_.isEqualWith` with an ArrayBuffer customizer (same pattern already in
  `EditContentParent.vue` and `arrayBufferCustomizer` in `shared/src/util/toEditable/toEditable.ts`):
  compare buffers by `byteLength` inside a try/catch instead of letting lodash recurse into them.
  Tests pass; pre-existing.

### Remove the `NODE_OPTIONS` localStorage shim from the test scripts

The `test`/`test:watch`/`test:unit` scripts in `cms/package.json` still prefix
`NODE_OPTIONS='--experimental-webstorage --localstorage-file=/tmp/luminary-ls.json'`. That shim is
now redundant: `vitest.localstorage.ts` (loaded first via `setupFiles` in `vitest.config.ts`) provides
an in-memory `localStorage` for jsdom on Node 26. Drop the `NODE_OPTIONS` prefix from all three scripts
so the scripts are plain `vitest`. (The same shim setup file was added to `app/`; check whether `app/`'s
scripts carry the prefix too.)

### Include language selection (mangoIsPublished language selection logic) in sync.

Need to think it through a bit more before implementing

### FTS in CMS not clearing deleted items

When filtering with FTS in the CMS, and deleting / adding an item (e.g. user), the FTS result is not updated removing the deleted item. A simple way to do this is perhaps listening for incoming docs (including DeleteCmd's) (using the same listener as the corresponding HybridQuery), and evict it from the search result if it passes the filter used by the HybridQuery

### Cms Sidebar

- ~~For app language selector just show the language~~

### CMS visual review

- Check uneven paddings
