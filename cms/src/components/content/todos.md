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
