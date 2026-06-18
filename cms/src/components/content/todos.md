# TODOs

## Add saving directly to `toEditable`

Move the persistence primitive into `toEditable` (`shared/src/util/toEditable/toEditable.ts`)
so consumers don't each re-implement the "upsert the edited doc + `updateShadow` to
re-baseline the dirty state" dance.

**Why:** the same logic is currently duplicated across consumers:

- `useEditContentSource.save()` (`cms/src/components/content/composables/useEditContentSource.ts`)
  — per-item `db.upsert(...)` then `contentEditable.updateShadow(id)` / `parentEditable.updateShadow(id)`.
- `useDexieLiveQueryAsEditable.save(id)` and `ApiLiveQueryAsEditable.save(id)` in `shared/`
  already do their own variants of this.

**Idea:** have `toEditable` return a `save(id)` (and/or `saveAll()`) that upserts the
editable item(s) via `db.upsert` and calls `updateShadow` on success — i.e. fold the
`useDexieLiveQueryAsEditable.save` behaviour into `toEditable` itself. Consumers then call
`save(id)` instead of hand-rolling upsert + `updateShadow`.

**Watch out for:**

- `toEditable` is generic over `BaseDocumentDto`; keep the save path doc-type-agnostic
  (no Content/Post/Tag specifics — those stay in the consumer).
- EditContent's `save()` also does upload-writeback bookkeeping (`waitForUpdate`),
  redirect creation, and skips delete-of-never-saved rows — that orchestration stays in
  the consumer; only the upsert + re-baseline primitive moves down.
- Update the deprecated `useDexieLiveQueryAsEditable` / `ApiLiveQueryAsEditable` to reuse
  the new primitive rather than keep their own copies.
