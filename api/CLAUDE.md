# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository context

This is the `api/` package of the Luminary monorepo (sibling packages: `app/`, `cms/`, `shared/`, `playwright-tests/`, `docs/`). NestJS 10 + Fastify backend over CouchDB (via `nano`) with S3/MinIO for binary storage. Provides the sync, change-request, query, full-text-search, and storage-status endpoints that the `app/` PWA and `cms/` SPA depend on, plus a Socket.io gateway that pushes live document updates.

E2E/Playwright runs are owned by the user — do not invoke them. Tests requiring CouchDB or S3 are also user-driven; CI uses `scripts/start-couchdb-in-ci.sh` and `scripts/start-minio-in-ci.sh` for the containers.

## Prerequisites

Tests and dev require a running CouchDB and S3-compatible store. See `README.md` for the docker commands. Copy `.env.example` → `.env` and `.env.test.example` → `.env.test` before first run.

## Commands

Run from `api/`:

- `npm run start:dev` (or `npm run dev`) — Nest watch mode, default port 3000
- `npm run start:prod` — production mode (logs go to a tailable `api.log` instead of stdout)
- `npm run seed` — runs `main.ts` with `seed` arg: applies design docs and seeding docs from `src/db/seedingDocs/*.json`, then exits
- `npm run auth-setup` — interactive script to add/modify auth providers (see `AUTH_SETUP.md`)
- `npm run test` — Jest via `dotenv-cli` loading `.env.test`. Targeted runs: `npm test -- src/path/file.spec.ts -t "name"`. Use `npm run test:detect` to find open handles.
- `npm run test:cov` — coverage; `db/schemaUpgrade/` and `test/` are excluded
- `npm run lint` / `npm run lint:fix`
- `npm run typecheck` — `tsc --noEmit`

Node 20 (`.node-version`). `tsconfig.json` has `strictNullChecks: false` and `noImplicitAny: false` — be deliberate about null guards.

## Architecture

### Bootstrap (`src/main.ts`)

Order-sensitive — read `main.ts` before reordering anything:

1. `upsertDesignDocs(dbService)` — pushes CouchDB views/indexes from `src/db/designDocs/*.json`. New indexes go here. Immediately after, `warmIndexNameRegistry()` (`db/indexNameRegistry.ts`) loads the set of valid `use_index` names from those same JSON files; `/query` validation rejects any `use_index` not in that registry.
2. If invoked with `seed` arg: `upsertSeedingDocs`, then `process.exit(0)` — the rest of bootstrap is skipped.
3. `PermissionSystem.init(dbService)` — builds the in-memory permission graph from Group docs and subscribes to `groupUpdate` events.
4. `S3Service.initializeChangeListener(dbService)` — wires the singleton S3 client cache to DB change events and disconnects.
5. `upgradeDbSchema(dbService)` — runs schema upgrades sequentially (see below).
6. CORS allowlist from `CORS_ORIGIN` env (JSON-parsed); allowed headers include `x-auth-provider-id` (multi-provider auth header).

### Data layer (`src/db/db.service.ts`)

`DbService` extends `EventEmitter`. The CouchDB `_changes` feed is the single source of update events; it starts immediately on construction and resumes from the last delivered `seq` (initially `"now"`) so reconnects don't replay history that consumers already loaded via their own snapshot queries. The advance happens **after** listeners run so a mid-handler crash re-delivers on next connect.

Events you must observe in any cache or in-memory state:

- `update` — every typed doc change. Caches subscribe here for updates.
- `groupUpdate` — group docs and group-`DeleteCmd`s. Used by `PermissionSystem` to update the access graph.
- `languageUpdate` — language docs and language-`DeleteCmd`s. Used by `QueryService` for the in-memory languages list.
- `disconnect` / `reconnect` — emitted only on a real connected→disconnected transition (not on initial connect). **In-memory caches built from DTOs must clear on `disconnect` and rehydrate on `reconnect`** — otherwise changes during the outage are lost. Examples: `QueryService.languages`, `AuthIdentityService.providerCache` / `autoGroupMappingsCache` / `jwksClients`, `S3Service.clearCache()`.

Writes go through `upsertDoc(doc)` which auto-generates `DeleteCmd` docs when `memberOf` changes or `deleteReq` is set. `insertDoc` retries on `Document update conflict` with jittered backoff. `executeFindQuery` is the only path that calls `nano`'s `db.find` directly — all permission/expiry/status filtering happens upstream of it.

### Schema upgrades (`src/db/schemaUpgrade/`)

`db.upgrade.ts` chains `v9..v15` in order; each upgrade reads `_schemas.schemaVersion`, no-ops if not at its expected version, and bumps the version on success. See `schemaUpgrade/README.md` for the full lifecycle (when to add, when to remove). Current baseline: v13+; tests start at the seeded version and **do not run upgrades** — seeding data must already be in the latest schema. When changing doc shapes, prefer bumping `updatedTimeUtc` in a schemaUpgrade over shipping a client-side migration.

### Permissions (`src/permissions/permissions.service.ts`)

`PermissionSystem` is a static class with an in-memory graph of groups, ACL entries, and inherited access. Key entry points:

- `PermissionSystem.init(db)` — boot-time hydration; subscribes to `groupUpdate`.
- `PermissionSystem.verifyAccess(groups, docType, permission, userGroups, "any"|"all")` — the workhorse for change-request validation.
- `PermissionSystem.accessMapToGroups(accessMap, permission, docTypes)` — used by Socket.io to compute room membership and by `QueryService` to filter results.

`AccessMap` is `Map<groupId, Map<DocType, Map<AclPermission, boolean>>>` and is built per-user from their group membership. It is delivered to clients on socket connect (`clientConfig` event) and replaces theirs wholesale.

### Auth (`src/auth/`)

Multi-provider OIDC. `AuthProvider` documents in the DB define each provider (domain, audience, client ID, claim mappings); the client sends an `x-auth-provider-id` header alongside the `Authorization: Bearer …` token. `AuthIdentityService.resolveOrDefault(token, providerId)` returns either an authenticated `JwtUserDetails` or an anonymous identity with `getDefaultGroups()`. JWKS clients are cached per-domain; the cache invalidates on `AuthProvider` doc updates.

**Failure-reason codes** (`AuthFailureReason`) are critical for client behavior: `provider_not_found` tells the client to evict its cached provider doc and re-pick; `token_invalid` triggers a similar eviction so Dexie can resync. The Socket.io gateway in `socketio.ts` injects these into `connect_error` payloads; the REST `AuthGuard` does the equivalent via `UnauthorizedException`.

The `JwtModule` is registered globally in `app.module.ts`. Group-membership and identity claims are derived from arrow-function strings in `JWT_MAPPINGS` env var — these are `eval`-equivalent so the env value is trusted config.

### Socket.io (`src/socketio.ts`)

One room per `${docType}-${groupId}`. On `joinSocketGroups`, the server emits a `clientConfig` (max upload sizes + accessMap) then joins the user to every room their accessMap grants View on, plus the matching `deleteCmd-${groupId}` rooms. `DbService` `update` events fan out to the appropriate rooms by resolving the doc's groups (for Content: via its parent's `memberOf`; for Change docs: via the embedded `changes` payload). Auth happens in a Socket.io middleware before the connection is accepted.

### Endpoints (`src/endpoints/`)

- `POST /changerequest` (`changeRequest.controller.ts`) — handles JSON and multipart (Fastify `request.parts()`). For multipart, file buffers are matched into `BINARY_REF-{uuid}` placeholders in the JSON payload by `util/patchFileData.ts`. `util/removeDangerousKeys.ts` strips prototype-pollution keys before any further processing. Dispatches by `doc.type` through `changeRequests/documentProcessing/process*Dto.ts`.
- `POST /query` (`query.controller.ts` + `query.service.ts`) — Mango queries. A single universal validator (`validation/query/validateQuery.ts`) enforces top-level shape, a `limit` cap, `use_index` membership in the design-doc registry, an operator policy (no `$regex`/`$where`; `$elemMatch` only on `memberOf`/`availableTranslations`/`parentTags`/`tags`), and selector depth/clause caps — it does NOT do per-identifier dispatch or restrict selector keys (the old template machinery was removed). `body.identifier` is now only an observability label (expensive-query logs / rate-limit context). `BYPASS_TEMPLATE_VALIDATION=true` is a dev/test escape hatch — never in prod. `QueryService` is the data-leakage boundary: it injects permission filters and (when `cms !== true`) published/expiry filters before `executeFindQuery`, blocks the internal `crypto` doc type, and sets `execution_stats: true` so the controller can log expensive (scan-like) queries and feed the optional per-identity rate limiter (`ratelimit/`, default off via `QUERY_RATE_LIMIT_ENABLED`).
- `POST /fts` (`ftsSearch.controller.ts` + `ftsSearch.service.ts`) — server-side full-text search complementing offline FTS (ADR 0010). Reproduces the client's trigram + BM25 ranking against the full corpus using two CouchDB views (`fts-trigram-index` splits each `fts` entry to one row per trigram with doc-level filter metadata in the value; `fts-corpus-stats` serves `_stats` for avg doc length). Permission + (non-`cms`) published/scheduled/expired/language filtering is done in JS from the embedded view-row metadata before the top-K cap, then the top-K docs are fetched (by-key `_all_docs`) for full BM25 + word-match parity (`util/ftsScoring.ts`). Returns ranked page bodies **trimmed of `fts`/`ftsTokenCount` — display-only, clients must not persist them**. The same endpoint also serves a **strict aux path** for non-Content doctypes (`User`, `Redirect`): when `types` is a single such doctype, `searchAux` reads that doctype's own trigram view (`fts-trigram-index-user` / `fts-trigram-index-redirect`, which emit a named metadata object instead of the Content positional tuple) and does substring-AND on the searchable fields + a field sort + permission/`groups` filtering — no BM25, no corpus stats (`AUX_FTS_CONFIG` in `ftsSearch.service.ts`). The `fts` index for these doctypes is computed in `processUserDto`/`processRedirectDto` (strict-only field configs `USER_FTS_FIELDS`/`REDIRECT_FTS_FIELDS`, no client mirror) and backfilled by schema upgrade v18.
- `GET /storage/storagestatus` (`storageStatus.controller.ts`) — bucket connectivity probe; requires `View` on the `Storage` doc.

All endpoints use `AuthGuard` and validate `apiVersion` via `validation/apiVersion.ts`. Backwards compatibility policy: ADR 0005.

### Change-request processing (`src/changeRequests/`)

`processChangeRequest.ts` is the pipeline:

1. `validateChangeRequest` runs `class-validator` decorators on the appropriate DTO.
2. `validateChangeRequestAccess` enforces permission rules per doc type (covers Edit/Translate/Publish/Assign/Delete, ACL changes on Group docs, default-language changes on Language docs, tag-assignment checks). Read this file before changing permission semantics.
3. A doc-type-specific `process*Dto` finalizes the document (image processing, FTS indexing, language file generation, S3 uploads, etc.).
4. `db.upsertDoc(doc)` writes and emits.

`util/ftsIndexing.ts` computes server-side trigram FTS for Content docs as part of `processContentDto`. **Boost/field config must stay identical** to `shared/src/fts/ftsSearch.ts` — when you change one, change both (ADR 0009). The same boosts and BM25 params are also reused by server-side FTS *search* in `util/ftsScoring.ts` (the `POST /fts` endpoint, see below), so the "change one, change all" rule spans three files now (ADR 0010).

### S3 (`src/s3/s3.service.ts`)

`S3Service` is a static-method-driven singleton cache keyed by `bucketId`. Instances expire after 10 min of inactivity (`cleanupStaleInstances`); on DB `disconnect` the entire cache is dropped because rotated credentials would otherwise leave stale Minio clients in use. Credentials are stored encrypted on `Crypto` docs (`util/encryption.ts`), keyed by `ENCRYPTION_KEY` env var.

There is a separate audio-bucket S3 config (`S3_MEDIA_*` or fallback `S3_*` env vars) for media uploads.

### Test setup (`src/test/testingModule.ts`)

`createTestingModule(testName)` creates a fresh `luminary-test-<testName>` CouchDB DB per test file, seeds it, mocks `AuthIdentityService` to default to anonymous, and provides a real `DbService`, `Socketio`, and `S3Service`. Use this rather than hand-rolling test modules. Tests share the prefix `DB_DATABASE_PREFIX` (default `luminary-test`).

`nest-cli.json` ensures `designDocs/*.json` and `seedingDocs/*.json` are copied into `dist/src/` on build so production startup can find them.

## Conventions

- Strict null/any checks are off in `tsconfig.json` — be deliberate about runtime guards even where the type system doesn't force them.
- `*.spec.ts` lives next to the unit under test (no separate `__tests__/` folders here).
- DTOs in `src/dto/` are the API-side mirror of `shared/src/types/dto.ts`. Field changes must land in both; the API is authoritative for fields it sets (e.g., `parent*`, `availableTranslations`, `fts`, `ftsTokenCount`, `statusChangeDeleteCmdId`).
- `class-validator` decorators on DTOs are enforced by the global `ValidationPipe` and by `validateChangeRequest`. Use `@Expose()` from `class-transformer` on every persisted field — `instanceToPlain` drops un-exposed fields when writing.
- New Mango sync queries require a matching `sync-*-index.json` design doc **and** must pass the `sync.ts` validator.
- Encrypted fields (S3 credentials, etc.) use `util/encryption.ts`; the encryption key lives in `ENCRYPTION_KEY` and rotation is not yet automated — don't store anything irrecoverable.
- Backwards compatibility: see ADR 0005 (`docs/adr/0005-backwards-compatibility.md`).
