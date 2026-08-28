# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository context

This is the `cms/` package of the Luminary monorepo (sibling packages: `api/`, `app/`, `shared/`, `playwright-tests/`, `docs/`). Vue 3 + TypeScript + Vite SPA used by editors to manage content that the `app/` PWA consumes. Depends on the local `luminary-shared` package via `file:../shared`. Vite consumes `shared/src` directly (alias `luminary-shared` → `../shared/src/index.ts` + `dedupe: ["vue","dexie","@vueuse/core"]` in `vite.config.ts`, mirrored as `tsconfig.app.json` `paths`), so editing shared source hot-reloads with no rebuild; only a shared **type** change needs `npm run build` in `shared/` (types resolve from `dist/index.d.ts`). Install with a plain `npm install`.

E2E tests live in `../playwright-tests/` — this package has none of its own. They sign in as seeded personas against a local OIDC issuer, so CMS permission behaviour is covered there. E2E runs are owned by the user — do not invoke them.

## Commands

Run from `cms/`:

- `npm run dev` — Vite dev server on http://localhost:4175 (strict port)
- `npm run build` — runs `type-check` and `build-only` in parallel
- `npm run type-check` — `vue-tsc --build --force`
- `npm run test` / `npm run test:unit` — Vitest (jsdom). Subset: `npm run test -- src/pages/Foo.spec.ts -t "name"`.
- `npm run lint` / `npm run lint:fix`
- `npm run format` — Prettier on `src/`

## Architecture

### Startup flow (`src/main.ts`)

Order-sensitive — read `main.ts` before reordering:

1. Pinia installed early so startup watchers (e.g. `useNotificationStore`) can resolve stores.
2. `init()` from `luminary-shared` sets up IndexedDB, the socket, and the doc index. `init()` no longer takes a sync list — what gets synced (and what joins socket rooms) is owned by the sync engine in `src/sync.ts` (`AuthProvider`, `Language`, then `Tag`, `Post`, `Redirect`, `Group`, `Storage` + their `Content` children). The CMS's live-only types (`User`, `AutoGroupMappings`) are served by `useHybridQuery` in API-only mode (live over REST + on-demand socket rooms) and intentionally not mirrored into Dexie (see `useAutoGroupMappings` / `UserOverview` and the comment in `sync.ts`). The connect handshake (`clientConfigReq`) still runs to deliver the accessMap and declare CMS mode (`cms: true`).
3. `registerAuthFailureHandler()` (`src/authFailure.ts`) attaches the socket `connect_error` listener for `auth_failed` **before** `setupAuth()` — otherwise the first failure event is lost and the client loops. Handles `provider_not_found` (clear credentials, open the provider modal, then reconnect anonymously so `AuthProvider` docs can still sync into it) and silent refresh via `refreshTokenSilently({ ignoreCache: true })`.
4. `initAuthLangSync()` runs **before** `setupAuth()`, so the watcher is already listening when the first `isConnected`/`accessMap` transition lands — whether that comes from `setupAuth()` connecting or from the auth-failure handler's anonymous reconnect.
5. After auth: a `serverError` watcher pushes debounced toast notifications (5s debounce). The CMS has no i18n layer — toast copy is hard-coded English here, not in shared.
6. `changeReqWarnings` / `changeReqErrors` watchers surface change-request feedback as warning/error notifications.
7. `initLanguage()`, `initSync()`, then mount.

### Sync architecture (`src/sync.ts`)

Two-tier sync driven by two iterators on `syncIterators`:

- **`language` iterator** ticks on `accessMap` or `isConnected` change. Drives sync of `AuthProvider` + `Language` docs (the bootstrap layer).
- **`content` iterator** ticks on the same triggers plus `cmsLanguageIdsAsRef` change, but only when at least one CMS language is selected. Drives sync of `Post`/`Tag`/`Redirect`/`Group`/`Storage` plus their `Content` children (scoped to the selected languages).

When `isConnected` flips false, `setCancelSync(true)` aborts in-flight syncs. `triggerSync()` bumps both iterators for manual re-sync. `Content` syncs pass `includeDeleteCmds: false` because parent-type syncs already handle delete commands (permissions are calculated on the parent type).

### Data layer

No Pinia-managed document cache. Documents come from `luminary-shared`'s IndexedDB via Mango queries; UI subscribes to live refs. Pinia is used for UI state only (notifications, etc. — see `src/stores/`).

### Auth (`src/auth.ts`)

Generic OIDC via `oidc-client-ts` (`UserManager`), not a Vue plugin — `useAuth()` is a plain function reading module-level refs, safe to call regardless of whether a provider was installed. Multiple providers are selected at runtime from `AuthProvider` docs; the full provider config (`_id`/`domain`/`clientId`/`audience`) is persisted to localStorage so resolution never depends on Dexie or IdP-specific cache-key formats. `setupAuth`, `refreshTokenSilently`, `loginWithProvider`, `useAuth`, `openProviderModal`, `clearAuthCache`, `resolveActiveProvider` are all entry points used by `main.ts`'s error handler and `router/index.ts`'s `conditionalAuthGuard` (a hand-rolled replacement for Auth0-vue's `authGuard`, which has no `oidc-client-ts` equivalent) — keep them exported. `refreshTokenSilently` single-flights concurrent calls, scoped to the manager they started against, so a provider switch mid-refresh can't have a stale call resurrect the wrong session. The CMS has no unauthenticated state: a known provider that isn't currently authenticated (expired refresh token between visits) re-triggers a visible login redirect rather than leaving the user stuck.

### i18n

The CMS UI is English-only — there is no i18n layer. Translation infrastructure (Language docs, `initLanguage`) is loaded only because shared content/Language metadata is multilingual.

## Conventions

- Path alias `@` → `src/` (in `vite.config.ts` + tsconfig).
- Tailwind for styling; `prettier-plugin-tailwindcss` reorders classes on format.
- Sentry is initialised in `main.ts` only when `import.meta.env.PROD`. The `Sentry` re-exported from `globalConfig` may be undefined elsewhere — null-check.
- Vitest globals enabled (`describe`/`it`/`expect` are ambient); `jsdom` environment; coverage excludes `src/main.ts`.
- Migration in progress: feature folders should colocate a `__tests__/` subdirectory (e.g. `pages/ComponentFolder/__tests__/`). New tests follow this pattern.
- `LImage` is the standard image component, including for small icons like auth provider logos.
