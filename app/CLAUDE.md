# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository context

This is the `app/` package of the Luminary monorepo (sibling packages: `api/`, `cms/`, `shared/`, `playwright-tests/`, `docs/`). It is an offline-first Vue 3 + TypeScript PWA built with Vite. It depends on the local `luminary-shared` package via `file:../shared`. Vite consumes `shared/src` directly (see Commands below), so most changes to that package hot-reload with no rebuild — only a shared **type** change needs `shared/` rebuilt first.

Cross-package E2E tests live in `../playwright-tests/` (separate `playwright.config.ts`), not in `app/`. There is no in-package Playwright config.

## Commands

Run everything from `app/`:

- `npm run dev` — Vite dev server on http://localhost:4174 (strict port)
- `npm run dev:web` — web/SSG dev server via `vite.config.web.ts`
- `npm run build` — runs `type-check` and `build-only` in parallel
- `npm run build:web` — full SSG prerender into `dist-web/`
- `SSG_ONLY_ROUTES="/a,/b" npm run build:web` — scoped SSG rebuild for listed routes
- `npm run preview:web` — preview `dist-web/` on port 4174
- `npm run type-check` — `vue-tsc --build --force`
- `npm run test` / `npm run test:unit` — Vitest (jsdom). Pass a path or `-t "name"` to run a subset, e.g. `npm run test -- src/pages/HomePage.spec.ts -t "renders"`.
- `npm run lint` / `npm run lint:fix`
- `npm run format` — Prettier on `src/`

Install with a plain `npm install` (the shared lib is linked via `file:../shared`). Vite consumes `shared/src` directly (alias `luminary-shared` → `../shared/src/index.ts` + `dedupe: ["vue","dexie","@vueuse/core"]` in `vite.config.ts`, mirrored as `tsconfig.app.json` `paths` so a single copy is resolved), so editing shared source hot-reloads with no rebuild. A shared **type** change still needs `npm run build` in `shared/` (types resolve from `dist/index.d.ts`). E2E/Playwright runs are owned by the user — do not invoke them.

## Architecture

### Native/SPA startup (`src/main.ts`)

The boot sequence is order-sensitive — read `main.ts` before reordering anything:

1. Pinia is installed early so watchers registered during startup can resolve stores.
2. `warmMangoCaches()` hydrates Mango query caches from localStorage before any IDB query.
3. `init()` from `luminary-shared` sets up IndexedDB and the socket. What gets synced (and which socket rooms are joined) is owned by the sync engine in `src/sync.ts` (`AuthProvider`, `Tag`, `Post`, `Language`, `Redirect`, `Storage`; `contentOnly` docs scoped by language) — not declared in the `init()` config.
4. A `connect_error` listener for `auth_failed` is registered **before** `setupAuth()` — otherwise the first failure event is lost and the client loops. Handles `provider_not_found` (forces provider re-pick) and silent refresh via `refreshTokenSilently({ ignoreCache: true })`.
5. i18n is initialised before mount because splash-screen components call `useI18n()` at setup time.
6. After mount: `initAuthLangSync`, `initLanguage`, `initSync`, plugin loading, then `markAppReady()`.

### Web/SSG startup (`src/main.web.ts`)

`main.web.ts` is the web-only ViteSSG entry. Native keeps using `main.ts`; do not move web boot code into the native path. The web build uses `vite.config.web.ts`, writes `dist-web/`, has no service worker, and hydrates prerendered public pages by seeding `luminary-shared`'s `hqcache:*` response cache before the ES module boots.

During prerender, `main.web.ts` installs Pinia, initializes i18n from public `Language` docs fetched through anonymous `queryRemote`, adds localized public static routes, and sets the render language from the URL/route map. On the client it restores the serialized language/Pinia state, then dynamically imports `src/ssg/clientRuntime.ts` and `src/auth.ts` before mount so hydration uses the live shared data layer.

### Data layer

There is no Vuex/Pinia-managed document cache. Documents come from `luminary-shared`'s IndexedDB via Mango queries (`db/`, `fts/`). UI code subscribes to live refs returned by those queries. The shared lib also owns the socket and REST clients. Server 5xx errors arrive via the shared `serverError` ref; `main.ts` translates them into a debounced toast (translation is the app's responsibility, not shared's).

### Auth (`src/auth.ts`)

Uses `@auth0/auth0-vue` with multiple providers selected at runtime from `AuthProvider` docs. The provider modal, silent refresh, and Auth0 cache clearing are all entry points used from `main.ts`'s error handler — keep them exported.

### Routing & pages

`src/router/routes.ts` is the shared route table used by both native (`router/index.ts`) and web (`main.web.ts`). `src/router/localizedRoutes.ts` adds web-only locale-prefixed public static routes (`/<code>`, `/<code>/explore`, `/<code>/watch`); keep native routes unchanged unless the native app actually needs the same URL shape.

Page-level components are in `src/pages/` and feature components in `src/components/`. The repo is mid-migration to colocate `__tests__/` next to feature folders (see `pages/SingleContent/`, `components/HomePage/`, etc.). New tests should follow that pattern.

### Web SSG/ISR

`src/ssg/README.md` is the detailed reference. The short version: `vite.config.web.ts` enumerates public routes, prerenders them with `vite-ssg`, emits SEO artifacts and SSG sidecars, and supports scoped rebuilds via `SSG_ONLY_ROUTES`. The separate deploy repo owns polling for changes, selecting affected routes, invoking the scoped build, Cloud upload, and edge-cache purge.

### Render state (for prerender/SSG tooling)

`src/util/renderState.ts` sets `data-render-state` on `<html>` and dispatches a `render-state-change` `CustomEvent`. States: `loading`, `ready`, `error`. External prerenderers consume this; do not change the contract without updating `README.md`.

### i18n

UI strings live in CouchDB Language documents, loaded at runtime (`src/i18n.ts`). English seed is `../api/src/db/seedingDocs/lang-eng.json`. See `../docs/guides/translations.md` for the workflow.

Reading progress (segments, gates, homepage row): `docs/reading-progress-tracker/README.md`.

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
