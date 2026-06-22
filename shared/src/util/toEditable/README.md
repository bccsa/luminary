# toEditable

## Overview

`toEditable` turns a source `Ref<Array<T>>` (where `T extends BaseDocumentDto`)
into an independently editable clone, while tracking two kinds of change
separately:

- **User edits** — local mutations the caller makes to the editable copy.
- **Source modifications** — updates that arrive on the source ref (e.g. from a
  live query or sync) _while an edit is in progress_.

To keep these apart it maintains three copies internally — the live **source**,
a **shadow** baseline, and the **editable** clone the UI binds to. Incoming
source updates are merged into the editable copy automatically, but only for
items the user has _not_ touched; an item with in-progress edits keeps its
edited value even when the source changes underneath it, and is instead flagged
as conflicting (see `isModified`). This is what stops external updates from
clobbering unsaved work.

Comparisons ignore the server-managed metadata fields `_rev`, `updatedTimeUtc`
and `updatedBy`, so a re-saved-but-otherwise-identical document is not reported
as edited.

Alongside the in-memory edit state (`isEdited` / `isModified`), it also surfaces
`hasLocalChanges(id)` — whether a document has a change saved locally and queued
for upload but not yet acknowledged by the server. Together these three give a
consumer the full per-document edit lifecycle without hand-rolling a queue query.

It also persists edits for you: `save(id)` writes a single item back, choosing
the local store or the API per document (see [Saving](#saving)). The source is
any `Ref<Array<T>>`, so it composes with any of the reactive read primitives;
the typical pairing is [`useHybridQuery`](../HybridQuery/README.md), whose
`output` ref plugs straight in.

## Usage

```typescript
import { toEditable, useHybridQuery, DocType, type ContentDto } from "luminary-shared";

// Whether this query keeps its documents offline. Pass the SAME value to both the
// query and toEditable — it is what makes save() write locally vs. straight to the API.
const persistOffline = true;

// useHybridQuery returns its `output` ref (a Ref<Array<T>>), so wrap it inline:
const { editable, isEdited, isModified, revert, save } = toEditable<ContentDto>(
    useHybridQuery<ContentDto>(
        () => ({ selector: { type: DocType.Content }, $sort: [{ publishDate: "desc" }] }),
        { live: true, persistOffline },
    ),
    { persistOffline },
);

// Bind `editable` to the UI and mutate it freely:
editable.value[0].title = "New title";
isEdited.value(editable.value[0]._id); // true

// Persist one item. `save` picks the right write path for the document and resets
// the baseline (so `isEdited(id)` returns false again) once the write is accepted:
await save(editable.value[0]._id);

// Discard local edits for one item:
revert(id);
```

Any reactive array source works — e.g. `useDexieLiveQuery(() => db.docs.…, { initialValue: [] })`
for a pure-IndexedDB read. When the source is a query that can persist offline,
pass its `persistOffline` value through to `toEditable` so `save` routes correctly.

### Saving

`save(id)` persists a single edited item and promotes the saved value to the
shadow baseline on success. It is a no-op (returns `{ ack: "accepted" }`) when the
item has not been edited, and applies `filterFn` (if set) to the item before
writing. It routes **per document** based on whether the document is persisted
offline:

- **Persisted offline → local write.** The item is written to the local document
  store and queued for upload (`db.upsert` with `overwriteLocalChanges`). A
  document counts as persisted offline when it is synced (for content: its
  `publishDate` is within the configured sync window; for other types: the type is
  in the active sync set) **or** when `persistOffline` is set on the options.
  Below-cutoff content saved this way is also retention-stamped so it is not evicted.
- **Not persisted offline → direct API write.** The item is sent straight to the
  server's change-request endpoint, using a multipart request when it carries
  binary upload data.

`save` resolves to the change acknowledgement (`{ ack, message?, … }`) or
`undefined` if the request failed; on a non-accepted result the edited state is
preserved so the caller can retry.

### Options

```typescript
const { editable } = toEditable(source, {
    // Normalize items before dirty-checking (e.g. so filtered-equivalent
    // changes aren't counted as edits). Affects comparisons only — the stored
    // `editable` keeps the unfiltered value.
    filterFn: (item) => item,

    // Apply defaults/normalization to items as they enter the editable copy.
    modifyFn: (item) => ({ ...item, enabled: item.enabled ?? true }),

    // Whether the wrapped query persists its documents offline. Pass the same
    // value the source query was created with; it steers `save` (local write vs
    // direct API write). Defaults to false.
    persistOffline: false,
});
```

## API

`toEditable(source, options?)` returns:

| Member | Description |
| --- | --- |
| `editable: Ref<Array<T>>` | The mutable clone to bind to the UI. |
| `isEdited(id): boolean` | `true` if the item differs from its shadow baseline (the user has edited it). Reactive — accessed as `isEdited.value(id)`. |
| `isModified(id): boolean` | `true` only when the **source** changed for an item the user has _also_ edited — i.e. a conflicting upstream update. Reactive. |
| `hasLocalChanges(id): boolean` | `true` if the item has a change saved locally and queued for upload but not yet acknowledged by the server. Reactive — accessed as `hasLocalChanges.value(id)`. |
| `revert(id): void` | Restore an item to its shadow baseline. If the item was newly added (not in the shadow), it is removed from `editable` entirely. |
| `updateShadow(id): void` | Promote the current editable item to the shadow baseline. `save` calls this on success; call it directly only if you persist outside of `save`. |
| `save(id): Promise<ChangeReqAckDto \| undefined>` | Persist one edited item, routing local-write vs direct-API-write by whether the document is persisted offline (see [Saving](#saving)). No-ops when unedited; updates the baseline on an accepted result. |

`ToEditableOptions<T>`:

| Option | Description |
| --- | --- |
| `filterFn(item) => T` | Applied to each item before comparison, so filtered-equivalent changes aren't counted as edits. Also applied to the item `save` writes. Affects `isEdited` / `isModified` and the saved value only; the stored `editable` value keeps the unfiltered item. |
| `modifyFn(item) => T` | Applied to items as they enter the editable copy: initial load, source additions, newly added editable items, and after `revert`. Useful for defaults/normalization. |
| `persistOffline: boolean` | Whether the wrapped query persists its documents offline. Steers `save`'s local-vs-API routing; pass the same value the source query was created with. Defaults to `false`. |
| `backPatchFields: (keyof T)[]` | Fields that always track the source, even on an item the user has edited. When a listed field's source value diverges from the shadow baseline it is copied source → editable **and** source → shadow, so the back-patched value never reads as dirty (`isEdited` stays unaffected). Server-wins per listed field: a concurrent local edit to a listed field is overwritten when the source changes it; a listed field the source has _not_ changed is left untouched, so an unsaved local edit to it is preserved. Use for server-owned / out-of-band fields (e.g. upload results the server fills in asynchronously). Defaults to `[]`. |

## Caveats

- **Call inside a component `setup` scope.** `toEditable` installs Vue `watch`ers
  on the source and editable refs; create it where effect-scope cleanup applies
  so they tear down on unmount.
- **Saving is opt-in per call.** `toEditable` never writes back automatically; it
  only persists when you call `save(id)`. Incoming source updates still flow into
  unedited items, but the editable copy is the source of truth until you save.
- **Throws on a bad source.** `source` must be a defined `Ref` whose `.value` is
  an array; otherwise the call throws.
- **Deprecated wrappers.** `ApiLiveQueryAsEditable` and `useDexieLiveQueryAsEditable`
  bundle a live query with `toEditable` and their own `save()`; both are deprecated.
  In new code, pair `toEditable` directly with a query (see
  [useDexieLiveQuery](../useDexieLiveQuery/README.md) and
  [HybridQuery](../HybridQuery/README.md)) and use the built-in `save`.
- **`createEditable` is deprecated.** It is a forwarding alias for `toEditable`
  (with `CreateEditableOptions` aliasing `ToEditableOptions`) kept for backwards
  compatibility and slated for removal; use `toEditable` in new code.
