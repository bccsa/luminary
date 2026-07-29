# Conversation: Add authorType field to drive jsonLD author @type

**Date:** 2026-07-29
**Commit:** `05a7272b` on branch `1672-app-research-and-implement-vue-ssr-for-ssgisr`
**Scope:** Cross-package feature — `shared/`, `api/`, `app/`, `cms/`

## Request

Add a field in the content editor to select whether the author is a **Person**
or an **Organization**, driving the jsonLD Article author `@type` field. Storage
must follow the `deleteReq` convention — a numeric `0`/`1` field rather than a
boolean or string enum.

The caller identified three files to touch:
- `api/src/dto/_contentParentDto.ts`
- `cms/src/components/content/EditContentParent.vue`
- `cms/src/components/content/composables/useEditContentSource.ts`

## Findings before editing

- jsonLD is generated client-side only, in `app/src/seo/contentHead.ts`
  (`articleJsonLd`) and `app/src/seo/publicSite.ts` (publisher/website).
- `articleJsonLd` hardcoded the author `@type` to `"Person"`, gated only on the
  truthiness of `ContentDto.author` (a per-translation string). There was no
  code path that ever emitted `"Organization"` for an author.
- The `author` **name** lives on `ContentDto` (per-translation). The user wanted
  the author **type** to live on the **parent** (`ContentParentDto`), which is
  shared by `PostDto` and `TagDto`.
- `deleteReq?: number` (`shared/src/types/dto.ts`, mirrored in
  `api/src/dto/_baseDto.ts`) is the reference pattern: `1` = true, `0`/`undefined`
  = false; all read sites use truthiness.
- Parent fields propagate parent→content via `parent*`-prefixed fields on
  `ContentDto` (e.g. `parentAlwaysOffline`, `parentUseVerticalTileLayout`),
  populated in `processContentDto.ts` and `processPostTagDto.ts`.

## Scope decision

The 3 listed files cover only the data model + CMS UI. For the field to
actually *drive* the jsonLD `@type`, it must also propagate parent→content and
be read by `articleJsonLd`. The user chose **full wire-through** (recommended).

## Encoding

`authorType?: number` — `0`/`undefined` = **Person** (default, preserves
existing jsonLD output for all existing docs), `1` = **Organization**.

## Changes

### Data model (shared + api, DTO mirror kept in sync)

- `shared/src/types/dto.ts`
  - `authorType?: number` on `ContentParentDto`
  - `parentAuthorType?: number` on `ContentDto`
- `api/src/dto/_contentParentDto.ts` — `authorType?` with
  `@IsOptional() @IsNumber() @Expose()` (added `IsNumber` import).
- `api/src/dto/ContentDto.ts` — `parentAuthorType?` (server-set on change-request
  processing).

### Parent→content propagation

- `api/src/changeRequests/documentProcessing/processContentDto.ts` —
  `doc.parentAuthorType = parentDoc.authorType;`
- `api/src/changeRequests/documentProcessing/processPostTagDto.ts` —
  `contentDoc.parentAuthorType = doc.authorType;`

### jsonLD consumer

- `app/src/seo/contentHead.ts` — `articleJsonLd` now emits `"Organization"` when
  `c.parentAuthorType` is truthy, else `"Person"`.

### CMS UI + dirty handling

- `cms/src/components/content/EditContentParent.vue` — post-only `LTextToggle`
  (Person / Organization) at the top of the display-options section; a computed
  bridges the string-modeled toggle to the numeric `authorType`.
- `cms/src/components/content/composables/useEditContentSource.ts` —
  `filterFn` strips `authorType === 0` so the Person default reads clean against
  docs that omit the field (symmetric dirty-check, same pattern as the other
  optional booleans).

## Verification

- `shared` rebuilt (`dist/` refreshed so consumers' type-check sees the new
  fields).
- `app` type-check: clean. `api` typecheck: clean.
- `cms` type-check: clean for the edited files. (The only errors reported were a
  **pre-existing** missing `oidc-client-ts` dependency in `cms/src/auth.ts`,
  unrelated to this change.)
- App jsonLD unit test (`SingleContent.spec.ts` — "builds Article JSON-LD with
  the language code, not the language doc id") passes.

## Notes / follow-ups

- No schema upgrade was needed: existing content docs lack `parentAuthorType`
  → `undefined` → Person, matching the previously hardcoded behavior. Docs gain
  `parentAuthorType` on their next change-request reprocessing.
- The api-side propagation tests (`processContentDto.spec.ts`,
  `processPostTagDto.spec.ts`) are CouchDB-dependent and user-owned, so they were
  not run — worth a glance to confirm the propagated field lands as expected.
- The UI is scoped to `DocType.Post` only (Tags are taxonomy and don't render an
  Article author). Drop the `v-if` if Tags should expose it too.
- **Branch note:** this was committed on `1672-app-research-and-implement-vue-ssr-for-ssgisr`,
  whose topic is SSR/SSG and is unrelated to this authorType work. The user
  explicitly asked to commit here; a dedicated branch may be preferable if this
  needs to ship independently of the SSR work.