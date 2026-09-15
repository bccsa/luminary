# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Luminary is an offline-first content platform. The repo is a monorepo with no root `package.json` and no workspace tooling — each package installs and builds independently:

- `api/` — NestJS 10 + Fastify backend over CouchDB (via `nano`) + S3/MinIO. See `api/CLAUDE.md`.
- `shared/` — `luminary-shared` lib (IndexedDB/Dexie, REST + Socket.io, sync engine, FTS, permissions, Vue composables). Consumed by `app/` and `cms/` via `file:../shared`. See `shared/CLAUDE.md`.
- `app/` — Offline-first Vue 3 PWA (Vite, port 4174). See `app/CLAUDE.md`.
- `cms/` — Vue 3 CMS SPA (Vite, port 4175). See `cms/CLAUDE.md`.
- `playwright-tests/` — Standalone E2E suite targeting **deployed** environments. Not wired into any package build. See `playwright-tests/README.md`.
- `docs/` — ADRs (`docs/adr/`), cross-package guides, and architecture diagrams. Package-specific docs live with their code (each package's own `README.md`/`docs/`). Index: `docs/README.md`.

**Always read the relevant subpackage's `CLAUDE.md` before working there.** This file only covers cross-package concerns.

## Local setup

The wizard `./scripts/setup-dev.sh setup` provisions CouchDB + MinIO containers, writes `.env` files, and installs in the correct order. For manual installs, the order matters:

```sh
cd shared && npm ci && npm run build      # build emits dist/ — app/cms resolve shared TYPES from dist/index.d.ts
cd ../app && npm ci                        # plain install; `file:../shared` symlinks shared in
cd ../cms && npm ci
cd ../api && npm ci
```

`app/` and `cms/` consume `shared/src` **directly** at runtime: their Vite config aliases
`luminary-shared` → `../shared/src/index.ts` and `dedupe`s `vue`/`dexie` (a single instance
is mandatory — two copies break Dexie/Vue reactivity; `vue`/`dexie` are `shared`'s
peerDependencies and the consumers' own deps). Consequence:

- **Editing `shared/` source no longer needs a rebuild or re-install** — Vite HMR picks it up.
- A shared **type/signature** change still needs `npm run build` in `shared/` (consumers
  resolve shared *types* from `dist/index.d.ts`); behavioural changes hot-reload.
- `--install-links` is no longer used; consumers symlink `shared` via plain `npm install`.
  (After pulling shared changes that alter its API, rebuild `shared/` so consumer
  type-checks see the new `dist/index.d.ts`.)

## Default local ports

3000 (api), 4174 (app), 4175 (cms), 5984 (CouchDB), 9000/9001 (MinIO S3 + console).

## Cross-package contracts

These are the seams that bite when you change one side and forget the other:

- **DTO mirror.** `api/src/dto/*` mirrors `shared/src/types/dto.ts`. Field changes must land in both. The API is authoritative for server-set fields (`parent*`, `availableTranslations`, `fts`, `ftsTokenCount`, `statusChangeDeleteCmdId`).
- **FTS field config.** `api/src/util/ftsIndexing.ts` and `shared/src/fts/ftsSearch.ts` use identical boost/field configuration (title=3.0, summary=1.5, text=1.0, author=1.0). Change both or search relevance silently diverges (ADR 0009).
- **Sync query validation.** New Mango sync queries in `app/` or `cms/` require a matching `api/src/db/designDocs/sync-*-index.json` design doc — that file both materializes the CouchDB index and registers the `use_index` name. `/query` validation is a single universal ruleset (`api/src/validation/query/validateQuery.ts`): top-level shape, `limit` cap, `use_index` membership in the design-doc registry (`api/src/db/indexNameRegistry.ts`), and an operator policy (no `$regex`/`$where`; `$elemMatch` only on `memberOf`/`availableTranslations`/`parentTags`/`tags`). It does NOT restrict selector keys per query type, so new selector fields need no validator change. The data-leakage boundary is the permission injection in `query.service.ts` (which also blocks the internal `crypto` doc type), not the validator.
- **Auth failure codes.** `AuthFailureReason` codes (`provider_not_found`, `token_invalid`, …) emitted by `api/src/socketio.ts` and the REST `AuthGuard` drive client-side eviction and silent-refresh logic in `app/src/main.ts` and `cms/src/main.ts`. The handler is registered **before** `setupAuth()` in both clients — don't reorder.
- **Backwards compatibility.** Cross-version contracts (API ↔ deployed clients) are governed by ADR 0005 (`docs/adr/0005-backwards-compatibility.md`). The `apiVersion` validation in `api/src/validation/apiVersion.ts` is the gate.

## Workflow conventions

- **Branching:** single `main` branch for both staging and production (ADR 0003). Auto-deploys to staging; production is manual. Hide unfinished work behind feature flags rather than long-lived branches.
- **ADRs:** in `docs/adr/`. Use `adr new <title>` (requires [adr-tools](https://github.com/npryce/adr-tools)) for new ones.
- **E2E / Playwright runs are owned by the user — do not invoke them.** This applies to `playwright-tests/`, the `cms/` package's own Playwright e2e, and any DB/S3-dependent tests in `api/`. CI for E2E uses `scripts/start-couchdb-in-ci.sh` and `scripts/start-minio-in-ci.sh`.
- **CI:** `.github/workflows/` has one unit-test workflow per package (`api-unit-tests.yml`, `shared-unit-tests.yml`, etc.) plus `e2e-tests.yml`. Each runs only on its own package's path changes.

## Comment style

Comments capture *why* code exists or why it's written a certain way — not *what* it does (the code already says that) and not architecture or design rationale. A comment that reads like a paragraph of prose, enumerates everywhere a concept is "excluded," or reproduces a doc is a signal it belongs in an ADR (`docs/adr/`), the package docs, or the datamodel — not inline.

- **No comment when the *why* is obvious or the code is self-explanatory.** Comments don't have to be everywhere.
- **Keep a comment to a tldr — one or two short lines of *why*.** If more is needed, the explanation goes in docs and the comment shrinks to a one-line pointer.
- **Don't trim past clarity.** Brevity is not the goal; a readable *why* is. Keep the subject/referent — a dangling fragment like `// Never replicated` is useless because *replicated to what?* Say `// Sidecars are never replicated to clients`. If dropping a word loses what the comment is about, keep the word.
- **Never reproduce documentation in a comment.** A pointer is fine; re-explaining the contents is not.
- **Never point a code comment at a `temp_` doc** (see Development docs below) — those are scaffolding, not a source of truth the code should depend on. If the *why* needs to live in code, write it as JSDoc, not as a link to a temp doc.
- **JSDoc on exported APIs:** a one-line *why/what-it-is*. Reserve longer treatment for the docs.
- Don't rewrite pre-existing comments unless asked; match the surrounding file's convention.

## Development docs

Working/proposal docs that exist only to develop a feature — not to document the final product — are **temporary scaffolding**. Treat them as such:

- **Prefix their filenames with `temp_`** (e.g. `docs/temp_sidecar-...md`) so they're trivially findable and removable once the feature lands.
- **Never reference a `temp_` doc from code or tests.** Code comments and JSDoc must stand on their own; a `temp_` doc will be deleted, so linking to it rots immediately.
- When the feature ships, either delete the `temp_` docs (if the substance now lives in code/ADRs) or promote the durable parts into a permanent doc/ADR and drop the `temp_` prefix.
- Anything that genuinely needs to be documented *in code* uses **JSDoc** (`/** */`), neatly — not `//` prose paragraphs.

## When changes span multiple packages

Touching DTOs, FTS, sync queries, or auth payloads almost always means a coordinated edit across `api/` + `shared/` (and sometimes `app/`/`cms/`). Build order for verifying locally: `shared` → `api` → `app`/`cms`. `app`/`cms` consume `shared/src` directly (Vite alias), so a shared **behaviour** change needs no rebuild; only a shared **type** change requires `npm run build` in `shared/` for the consumers' type-check to see it (they resolve shared types from `dist/index.d.ts`).
