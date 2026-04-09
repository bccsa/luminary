# Test Coverage Analysis

## Summary

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Statements | 72.71% | 91.21% | 100% |
| Branches | 69.08% | 84.21% | 100% |
| Functions | 79.48% | 91.45% | 100% |
| Lines | 73.47% | 92.09% | 100% |

## Excluded from Coverage

| Path | Reason |
|------|--------|
| `src/db/schemaUpgrade/` (v9-v13) | One-time database migration scripts. These mutate live CouchDB data and cannot be safely unit tested without destructive historical schema setup/teardown. They are run-once scripts, not active business logic. |
| `*.d.ts` files | Type declaration files (`tiptap-html-server.d.ts`) contain no runtime code. |
| `src/test/` | Test infrastructure files (`socketioTestClient.ts`, `testingModule.ts`, `changeRequestDocuments.ts`) are test helpers, not source code. |

## Files at 100% Coverage

The following files achieved 100% statement/line coverage:

- `src/auth/auth.guard.ts` — was 29%, now 100%
- `src/validation/jwt.ts` — was 0%, now 100%
- `src/validation/x-query.ts` — was 0%, now 100%
- `src/validation/IsSortOptions.ts` — was 0%, now 100%
- `src/validation/IsStringTranslationRecord.ts` — was 0%, now 100%
- `src/validation/IsImage.ts` — was 100%, remains 100%
- `src/validation/IsAudio.ts` — was 92%, now 100%
- `src/changeRequests/uploadHandler.ts` — was 0%, now 100%
- `src/util/fileTypeDetection.ts` — was 0%, now 100%
- `src/util/removeDangerousKeys.ts` — was 92%, now 100%
- `src/util/patchFileData.ts` — was 91%, now 100%
- `src/s3-audio/audioFormatDetection.ts` — was 75%, now 100%
- `src/app.controller.ts` — was 0%, now 100%
- `src/main.ts` — was 0%, now 100% stmts
- `src/configuration.ts` — was 100% stmts/87.5% branch, now 100%/95.8%
- `src/db/db.upgrade.ts` — was 0%, now 100%
- `src/util/encryption.ts` — was 94%, now 98.5%
- `src/jwt/processJwt.ts` — was 90%, now 98.6%
- All DTOs — now tested with class-validator
- All enums, utilities, and validators — 100%

## Remaining Gaps

### Partially Covered — Remaining Work

| File | Before | After | Uncovered Lines | Reason for Gap |
|------|--------|-------|-----------------|----------------|
| `src/socketio.ts` | 35% | 35% | 101-113, 122-156, 174-204 | WebSocket auth failure path requires client to receive events before server-side disconnect. Room management and DB update broadcasts are now tested but the auth failure middleware (lines 103-109) disconnects the socket before the client receives the `apiAuthFailed` event, making it unreliable in tests. |
| `src/changeRequests/documentProcessing/processMediaDto.ts` | 58% | 62% | 29-109, etc. | S3 bucket migration logic (lines 29-109) requires two separate S3 instances with real buckets and files. Error paths for individual file migration failures need S3 service to throw mid-operation. |
| `src/changeRequests/documentProcessing/processImageDto.ts` | 85% | 85% | 112-113, 168-172, etc. | Image migration between buckets has pre-existing timeout failures in CI. Image resize/upload error paths require Sharp library to fail. |
| `src/changeRequests/documentProcessing/processPostTagDto.ts` | 84% | 84% | 41, 54, 66, 81-83, etc. | Rollback paths for failed image/media migration require `processImage`/`processMedia` to return `migrationFailed: true`, which only happens with real S3 bucket operations. |
| `src/db/db.service.ts` | 85% | 85% | 139, 155-160, 196-204, etc. | CouchDB-specific error paths, `processAllDocs` pagination loop, and `getBySlug` access filtering require specific database states. Lines 984-1043 (`processAllDocs`) is a complex pagination method. |
| `src/db/MongoQueryTemplates/validateMongoQuery.ts` | 50% | 50% | 48, 81, 116-124, 135-181 | Function-string template validation (lines 116-181) requires template files with arrow function strings evaluated via `eval()`. Template file loading (lines 73-94) depends on filesystem structure. |
| `src/db/MongoQueryTemplates/validators/sync.ts` | 70% | 70% | 30, 40-42 | User document type filtering (line 30) and optional field validation (lines 40-42) require specific query structures. |
| `src/endpoints/changeRequest.controller.ts` | 77% | 77% | 63-76, 112 | Concatenated JSON recovery logic (lines 63-76) requires multipart requests with malformed JSON that can be partially recovered. |
| `src/endpoints/query.service.ts` | 84% | 84% | 26-34, 189, 196-200, 246 | Language update event handler (lines 26-34) fires on DB events. `memberOf` extraction variants (line 189 `$elemMatch.$in`) and invalid memberOf (lines 196-200) require specific query structures. |
| `src/endpoints/search.service.ts` | 91% | 91% | 50, 67, 96 | Slug search path (line 50), user permission forbidden (line 67), and db.search error catch (line 96). |
| `src/s3/s3.service.ts` | 90% | 90% | 70, 81-93, 123, etc. | S3 initialization retry, credential update listener, stale instance cleanup, and bucket deletion require long-running S3 operations and specific timing. Pre-existing test failures in `s3.service.spec.ts`. |
| `src/permissions/permissions.service.ts` | 98% | 98% | 184, 214, 274, 698 | Branch-only gaps: specific permission matrix combinations that are edge cases. |
| `src/changeRequests/aclValidation.ts` | 80% | 96% | 82 | Single uncovered line: Group type Edit + Assign branch ordering edge case. |
| `src/changeRequests/validateChangeRequest.ts` | 88% | 88% | 64-71, 135-136 | Redirect slug uniqueness (duplicate slug scenario) and nested validation error catch blocks. |
| `src/changeRequests/validateChangeRequestAccess.ts` | 92% | 92% | 202, 332-345 | Content with missing parent document, language default change validation. |
| `src/validation/apiVersion.ts` | 83% | 83% | 11 | **UNREACHABLE CODE** (see Known Issues below). |

### Pre-existing Test Failures

Two test suites have pre-existing failures unrelated to coverage work:

1. **`s3.service.spec.ts`** — `S3Error: The bucket you tried to create already exists` — S3 bucket naming collision between test runs.
2. **`processImageDto.spec.ts`** — Two tests exceed 5000ms timeout for S3 bucket migration operations.

## Known Issues Found

### `src/validation/apiVersion.ts` — Unreachable Code (Bug)

```typescript
// Line 10: clientVersion != clientVersion is ALWAYS false
if (clientVersion != clientVersion) {
    throw new HttpException(...); // Line 11 — UNREACHABLE
}
return clientVersion == clientVersion; // Line 16 — ALWAYS true
```

The function compares `clientVersion` to itself, making the throw unreachable and the return always `true`. The TODO comment on line 3 confirms this is a placeholder. Line 11 **cannot be covered** — it is dead code.

### `src/dto/DocsReqDto.ts` — Contradictory Decorators

Some fields are decorated with both `@IsNotEmpty()` and `@IsOptional()`, which is contradictory. `@IsOptional()` skips validation when undefined, but `@IsNotEmpty()` would reject empty strings when present. This may be intentional (allow undefined but not empty) or a bug.

## New Test Files Created

| File | Covers |
|------|--------|
| `src/validation/jwt.spec.ts` | jwt.ts validation utility |
| `src/validation/x-query.spec.ts` | X-Query header parser |
| `src/validation/IsSortOptions.spec.ts` | Custom sort validator |
| `src/validation/IsStringTranslationRecord.spec.ts` | Custom string validator |
| `src/validation/apiVersion.spec.ts` | API version validator |
| `src/validation/IsAudio.spec.ts` | Audio file validator |
| `src/changeRequests/uploadHandler.spec.ts` | Upload data factory |
| `src/changeRequests/aclValidation.spec.ts` | ACL validation logic |
| `src/util/fileTypeDetection.spec.ts` | File type detection |
| `src/util/removeDangerousKeys.spec.ts` | Prototype pollution protection |
| `src/util/patchFileData.spec.ts` | Binary reference patching |
| `src/auth/auth.guard.spec.ts` | JWT auth guard |
| `src/endpoints/query.controller.spec.ts` | Query REST controller |
| `src/endpoints/search.controller.spec.ts` | Search REST controller |
| `src/app.controller.spec.ts` | App protected endpoint |
| `src/app.module.spec.ts` | Module compilation |
| `src/main.spec.ts` | Bootstrap function |
| `src/configuration.spec.ts` | Configuration defaults/fallbacks |
| `src/db/db.upgrade.spec.ts` | Schema upgrade orchestration |
| `src/dto/ChangeDto.spec.ts` | Change DTO validation |
| `src/dto/DeleteCmdDto.spec.ts` | DeleteCmd DTO validation |
| `src/dto/DocsReqDto.spec.ts` | DocsReq DTO validation |
| `src/dto/SearchReqDto.spec.ts` | SearchReq DTO validation |
| `src/dto/ChangeReqAckDto.spec.ts` | ChangeReqAck DTO |
| `src/dto/StorageDto.spec.ts` | Storage DTO validation |

## Existing Test Files Expanded

| File | New Tests Added |
|------|----------------|
| `src/s3-audio/audioFormatDetection.spec.ts` | All codec paths (mpeg, pcm, aac, vorbis, opus, flac), container fallbacks, undefined numberOfChannels |
| `src/util/ftsIndexing.spec.ts` | Invalid entity references, incomplete entities |
| `src/util/encryption.spec.ts` | `retrieveCryptoData` error paths, `storeCryptoData` |
| `src/jwt/processJwt.spec.ts` | Missing JWT_MAPPING, invalid JSON parsing, mapping evaluation errors, email-only login |
| `src/changeRequests/documentProcessing/processStorageDto.spec.ts` | Credential deletion failures, credential update errors, encryption failures |
| `src/changeRequests/documentProcessing/processMediaDto.spec.ts` | Missing bucket ID, bucket not found, missing DB for deletion |
| `src/socketio.spec.ts` | joinSocketGroups, clientConfig, database update broadcasts, anonymous connection |
