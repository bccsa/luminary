# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository context

This is the `cms/` package of the Luminary monorepo (sibling packages: `api/`, `app/`, `shared/`, `playwright-tests/`, `docs/`). Vue 3 + TypeScript + Vite SPA used by editors to manage content that the `app/` PWA consumes. Depends on the local `luminary-shared` package via `file:../shared` — rebuild shared before changes are picked up here. Install with `npm install --install-links`.

Cross-package E2E tests also exist in `../playwright-tests/`. The `cms/` package itself uses Playwright for its own e2e tests (auth-bypass mode, see README). E2E runs are owned by the user — do not invoke them.

## Commands

Run from `cms/`:

- `npm run dev` — Vite dev server on http://localhost:4175 (strict port)
- `npm run build` — runs `type-check` and `build-only` in parallel
- `npm run type-check` — `vue-tsc --build --force`
- `npm run test` / `npm run test:unit` — Vitest (jsdom). Subset: `npm run test -- src/pages/Foo.spec.ts -t "name"`.
- `npm run lint` / `npm run lint:fix`
- `npm run format` — Prettier on `src/`

Auth bypass for local dev / e2e: set `VITE_AUTH_BYPASS=true` (mocks an `E2E Test User`, skips Auth0). Never enable in production.

## Architecture

### Startup flow (`src/main.ts`)

Order-sensitive — read `main.ts` before reordering:

1. Pinia installed early so startup watchers (e.g. `useNotificationStore`) can resolve stores.
2. `init()` from `luminary-shared` sets up IndexedDB, the socket, and the doc index. The CMS sync list registers all editable doc types (`AuthProvider`, `AutoGroupMappings`, `Tag`, `Post`, `Redirect`, `Language`, `Group`, `Storage`); `User` is registered with `sync: false`. `AutoGroupMappings` are listed but are served via `useHybridQuery` in API-only mode (live over REST + on-demand socket rooms) and intentionally not mirrored into Dexie (see `useAutoGroupMappings` and the comment in `sync.ts`).
3. The socket `connect_error` listener for `auth_failed` is registered **before** `setupAuth()` — otherwise the first failure event is lost and the client loops. Handles `provider_not_found` (force provider re-pick) and silent refresh via `refreshTokenSilently({ ignoreCache: true })`.
4. After auth: a `serverError` watcher pushes debounced toast notifications (5s debounce). The CMS has no i18n layer — toast copy is hard-coded English here, not in shared.
5. `changeReqWarnings` / `changeReqErrors` watchers surface change-request feedback as warning/error notifications.
6. `initAuthLangSync()`, `initLanguage()`, `initSync()`, then mount.

### Sync architecture (`src/sync.ts`)

Two-tier sync driven by two iterators on `syncIterators`:

- **`language` iterator** ticks on `accessMap` or `isConnected` change. Drives sync of `AuthProvider` + `Language` docs (the bootstrap layer).
- **`content` iterator** ticks on the same triggers plus `cmsLanguageIdsAsRef` change, but only when at least one CMS language is selected. Drives sync of `Post`/`Tag`/`Redirect`/`Group`/`Storage` plus their `Content` children (scoped to the selected languages).

When `isConnected` flips false, `setCancelSync(true)` aborts in-flight syncs. `triggerSync()` bumps both iterators for manual re-sync. `Content` syncs pass `includeDeleteCmds: false` because parent-type syncs already handle delete commands (permissions are calculated on the parent type).

### Data layer

No Pinia-managed document cache. Documents come from `luminary-shared`'s IndexedDB via Mango queries; UI subscribes to live refs. Pinia is used for UI state only (notifications, etc. — see `src/stores/`).

### Auth (`src/auth.ts`)

`@auth0/auth0-vue` with multiple providers selected at runtime from `AuthProvider` docs. `setupAuth`, `refreshTokenSilently`, `loginWithProvider`, `openProviderModal`, `clearAuth0Cache`, `resolveActiveProvider` are all entry points used by `main.ts`'s error handler — keep them exported. Auth-bypass mode short-circuits all of this.

### i18n

The CMS UI is English-only — there is no i18n layer. Translation infrastructure (Language docs, `initLanguage`) is loaded only because shared content/Language metadata is multilingual.

## Conventions

- Path alias `@` → `src/` (in `vite.config.ts` + tsconfig).
- Tailwind for styling; `prettier-plugin-tailwindcss` reorders classes on format.
- Sentry is initialised in `main.ts` only when `import.meta.env.PROD`. The `Sentry` re-exported from `globalConfig` may be undefined elsewhere — null-check.
- Vitest globals enabled (`describe`/`it`/`expect` are ambient); `jsdom` environment; coverage excludes `src/main.ts` and `src/pages/internal/ComponentSandbox.vue`.
- Migration in progress: feature folders should colocate a `__tests__/` subdirectory (e.g. `pages/ComponentFolder/__tests__/`). New tests follow this pattern.
- `LImage` is the standard image component, including for small icons like auth provider logos.
