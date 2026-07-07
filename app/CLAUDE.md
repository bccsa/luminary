# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository context

This is the `app/` package of the Luminary monorepo (sibling packages: `api/`, `cms/`, `shared/`, `playwright-tests/`, `docs/`). It is an offline-first Vue 3 + TypeScript PWA built with Vite. It depends on the local `luminary-shared` package via `file:../shared` — changes to that package require it to be rebuilt before they are picked up here.

Cross-package E2E tests live in `../playwright-tests/` (separate `playwright.config.ts`), not in `app/`. There is no in-package Playwright config.

## Commands

Run everything from `app/`:

- `npm run dev` — Vite dev server on http://localhost:4174 (strict port)
- `npm run build` — runs `type-check` and `build-only` in parallel
- `npm run type-check` — `vue-tsc --build --force`
- `npm run test` / `npm run test:unit` — Vitest (jsdom). Pass a path or `-t "name"` to run a subset, e.g. `npm run test -- src/pages/HomePage.spec.ts -t "renders"`.
- `npm run lint` / `npm run lint:fix`
- `npm run format` — Prettier on `src/`

Install with a plain `npm install` (the shared lib is linked via `file:../shared`). Vite consumes `shared/src` directly (alias `luminary-shared` → `../shared/src/index.ts` + `dedupe: ["vue","dexie","@vueuse/core"]` in `vite.config.ts`, mirrored as `tsconfig.app.json` `paths` so a single copy is resolved), so editing shared source hot-reloads with no rebuild. A shared **type** change still needs `npm run build` in `shared/` (types resolve from `dist/index.d.ts`). E2E/Playwright runs are owned by the user — do not invoke them.

## Architecture

### Startup flow (`src/main.ts`)

The boot sequence is order-sensitive — read `main.ts` before reordering anything:

1. Pinia is installed early so watchers registered during startup can resolve stores.
2. `warmMangoCaches()` hydrates Mango query caches from localStorage before any IDB query.
3. `init()` from `luminary-shared` sets up IndexedDB and the socket. What gets synced (and which socket rooms are joined) is owned by the sync engine in `src/sync.ts` (`AuthProvider`, `Tag`, `Post`, `Language`, `Redirect`, `Storage`; `contentOnly` docs scoped by language) — not declared in the `init()` config.
4. A `connect_error` listener for `auth_failed` is registered **before** `setupAuth()` — otherwise the first failure event is lost and the client loops. Handles `provider_not_found` (forces provider re-pick) and silent refresh via `refreshTokenSilently({ ignoreCache: true })`.
5. i18n is initialised before mount because splash-screen components call `useI18n()` at setup time.
6. After mount: `initAuthLangSync`, `initLanguage`, `initSync`, plugin loading, then `markAppReady()`.

### Data layer

There is no Vuex/Pinia-managed document cache. Documents come from `luminary-shared`'s IndexedDB via Mango queries (`db/`, `fts/`). UI code subscribes to live refs returned by those queries. The shared lib also owns the socket and REST clients. Server 5xx errors arrive via the shared `serverError` ref; `main.ts` translates them into a debounced toast (translation is the app's responsibility, not shared's).

### Auth (`src/auth.ts`)

Uses `@auth0/auth0-vue` with multiple providers selected at runtime from `AuthProvider` docs. The provider modal, silent refresh, and Auth0 cache clearing are all entry points used from `main.ts`'s error handler — keep them exported.

### Routing & pages

`src/router/` defines routes; page-level components are in `src/pages/` and feature components in `src/components/`. The repo is mid-migration to colocate `__tests__/` next to feature folders (see `pages/SingleContent/`, `components/HomePage/`, etc.). New tests should follow that pattern.

### Render state (for prerender/SSG tooling)

`src/util/renderState.ts` sets `data-render-state` on `<html>` and dispatches a `render-state-change` `CustomEvent`. States: `loading`, `ready`, `error`. External prerenderers consume this; do not change the contract without updating `README.md`.

### i18n

UI strings live in CouchDB Language documents, loaded at runtime (`src/i18n.ts`). English seed is `../api/src/db/seedingDocs/lang-eng.json`. See `../docs/guides/translations.md` for the workflow.

### Plugins

Full contract + injection-key + build-time virtual module pattern, diagrams, and a second-plugin walkthrough: `docs/vue-plugin-architecture/README.md`.

### Query string parameters

Supported flags (see `README.md` for full list): `autoplay=true`, `autofullscreen=true`, `nonotifications` (suppresses all in-app notifications — current branch work).

## Conventions

- Path alias `@` → `src/` (configured in `vite.config.ts` and tsconfig).
- Tailwind for styling; `prettier-plugin-tailwindcss` reorders classes on format.
- Sentry is initialised via `src/util/initSentry.ts`; use the exported `Sentry` (may be undefined when DSN is unset) — always null-check.
- `src/main.ts`, `src/analytics.ts`, `src/auth.ts`, and `src/guards/**` are excluded from coverage; don't chase coverage there.
- Vitest globals are enabled (`describe`/`it`/`expect` are ambient).
