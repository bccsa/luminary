# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Luminary is an offline-first content platform. The repo is a monorepo with no root `package.json` and no workspace tooling — each package installs and builds independently:

- `api/` — NestJS 10 + Fastify backend over CouchDB (via `nano`) + S3/MinIO. See `api/CLAUDE.md`.
- `shared/` — `luminary-shared` lib (IndexedDB/Dexie, REST + Socket.io, sync engine, FTS, permissions, Vue composables). Consumed by `app/` and `cms/` via `file:../shared`. See `shared/CLAUDE.md`.
- `app/` — Offline-first Vue 3 PWA (Vite, port 4174). See `app/CLAUDE.md`.
- `cms/` — Vue 3 CMS SPA (Vite, port 4175). See `cms/CLAUDE.md`.
- `playwright-tests/` — Standalone E2E suite targeting **deployed** environments. Not wired into any package build. See `playwright-tests/README.md`.
- `docs/` — ADRs (`docs/adr/`) and architecture diagrams.

**Always read the relevant subpackage's `CLAUDE.md` before working there.** This file only covers cross-package concerns.

## Knowledge graph (graphify)

**Only applies if graphify is installed** — i.e. the `graphify` CLI is on PATH (`command -v graphify` succeeds) and `graphify-out/graph.json` exists. If graphify is **not** installed, ignore this section and answer codebase questions with the normal tools (grep, file reads, subpackage `CLAUDE.md`s); do not attempt any `graphify` command.

When graphify is installed:

- For codebase questions, run `graphify query "<question>"` first. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than `graphify-out/GRAPH_REPORT.md` or raw grep output.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation instead of raw source browsing.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain don't surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

The `graphify-out/` directory is git-ignored — it's a local, generated artifact, not committed.

## Local setup

The wizard `./scripts/automate-luminary.sh setup` provisions CouchDB + MinIO containers, writes `.env` files, and installs in the correct order. For manual installs, the order matters:

```sh
cd shared && npm ci && npm run build      # must build first — app/cms link against dist/
cd ../app && npm ci --install-links       # --install-links is required (symlinks break Dexie reactivity)
cd ../cms && npm ci --install-links
cd ../api && npm ci
```

After editing `shared/`, rebuild it (`npm run build` in `shared/`) and re-run `npm install --install-links ../shared` in `app/` and/or `cms/`. The `scripts/post-checkout` git hook prompts to do this automatically on branch switch — install it with `cp scripts/post-checkout .git/hooks/post-checkout && chmod +x .git/hooks/post-checkout`.

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

## When changes span multiple packages

Touching DTOs, FTS, sync queries, or auth payloads almost always means a coordinated edit across `api/` + `shared/` (and sometimes `app/`/`cms/`). Build order for verifying locally: `shared` → `api` → `app`/`cms`. If `shared/` changed, the `--install-links` re-install in consumers is mandatory — without it the consumers will still see the old `dist/`.
