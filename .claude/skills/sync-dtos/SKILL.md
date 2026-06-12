---
name: sync-dtos
description: Mirror DTO field changes between api/src/dto/*.ts (class-based, decorator-validated) and shared/src/types/dto.ts (plain TypeScript types). Use when the user adds, renames, or removes a field on a document DTO on one side, or asks "keep DTOs in sync", "mirror DTO change", "I added X to ContentDto", or similar.
---

# sync-dtos

The API and the shared client library each define their own DTO shape for every document type. They must agree on field names, optionality, and types. This contract is the single most-likely-to-drift seam in this monorepo.

## The two sides

| Side | Location | Style |
|---|---|---|
| API | `api/src/dto/<Name>Dto.ts` (one class per file) | `class XxxDto extends _baseDto` with `class-validator` decorators (`@IsString`, `@IsOptional`, etc.) and `@Expose()` from `class-transformer` |
| Shared | `shared/src/types/dto.ts` (all types in one file) | Plain TypeScript `type XxxDto = BaseDocumentDto & { ... }` |

They differ in style, not in semantics. A field added on one side must appear on the other.

## Who owns what

The API is authoritative for fields **it sets**, not the client. The client is authoritative for nothing — even fields it originates on a change request still flow through API validation. Server-set fields you must NOT make required on the client write path: `parent*`, `availableTranslations`, `fts`, `ftsTokenCount`, `statusChangeDeleteCmdId`.

## Procedure

### 1. Identify the change

From the current diff (or the user's description), determine:

- Which DTO changed? (e.g. `ContentDto`, `PostDto`, `LanguageDto`, `DeleteCmdDto`)
- Which side did the change land on first? (api or shared)
- What is the change? (add field, remove field, rename, type change, optionality change)

If the change is unclear, read the file on the side that was edited.

### 2. Locate the counterpart

- API DTO → `api/src/dto/<Name>Dto.ts`
- Shared DTO → `shared/src/types/dto.ts` — search within that single file for `type <Name>Dto`

If the API DTO extends `_contentBaseDto` or `_baseDto`, the shared counterpart usually extends `ContentBaseDto` or `BaseDocumentDto`. Some fields live on the base type, not the child — check both.

### 3. Mirror the change

Map between the two styles:

| API (class) | Shared (type) |
|---|---|
| `@IsNotEmpty() @IsString() @Expose() name: string;` | `name: string;` |
| `@IsOptional() @IsString() @Expose() author?: string;` | `author?: string;` |
| `@IsEnum(PublishStatus) @Expose() status: PublishStatus;` | `status: PublishStatus;` |
| `@IsArray() @Expose() tags: Uuid[];` | `tags: Uuid[];` |
| `@IsNumber() @Expose() publishDate?: number;` | `publishDate?: number;` |
| Nested DTO: `@Type(() => ImageDto) @Expose() image: ImageDto;` | `image: ImageDto;` (and import `ImageDto`) |

Rules:

- **Required vs optional must match.** Mismatch = silent runtime breakage. The decorator pair `@IsNotEmpty()` (or absent `@IsOptional()`) → no `?` in shared.
- **Enums must point at the same enum.** API imports from `api/src/enums.ts`, shared imports from `shared/src/types/enum.ts`. The string values must match; the user is responsible for keeping the enums themselves in sync (a separate concern).
- **Every persisted API field must have `@Expose()`.** `instanceToPlain` drops un-exposed fields on write, so a missing `@Expose()` on a new field means it never reaches the DB. Flag this if you see a new field on the API side without it.
- **Don't forget the `import` line in `shared/src/types/dto.ts`** if you reference a new enum or nested type. The file is one big block; missing imports break the whole build.

### 4. Cross-check related files

If the field is on `ContentDto`, also check:

- `api/src/util/ftsIndexing.ts` — if the new field is text content, it may need to be indexed. Search the file for the existing fields (title/summary/text/author) to find the field config.
- `shared/src/fts/ftsSearch.ts` — same config must match (ADR 0009).

If the field affects sync filtering, no `/query` validator change is needed — `api/src/validation/query/validateQuery.ts` is a single universal ruleset that does not allowlist selector keys (it enforces only shape, the operator policy, `limit`, and `use_index` registry membership). New equality filters pass as-is.

### 5. Report

Output:

- The exact lines added/changed on each side, with file paths and line numbers.
- Any cross-checks performed (FTS, sync validator).
- A reminder: if shared/ was edited, `/rebuild-shared` is needed before app/cms pick up the change.

Don't run tests; don't push. Just mirror, then report.

## What this skill is NOT

- Not a DTO designer. The user decides the field shape; this skill mirrors a decided change.
- Not a schema upgrader. New required fields on existing docs need `/add-schema-upgrade` separately.
- Not an enum mirror. Enum changes in `api/src/enums.ts` and `shared/src/types/enum.ts` are a related but separate concern — flag if they mismatch, but don't auto-edit unless the user asks.
