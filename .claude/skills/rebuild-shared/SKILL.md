---
name: rebuild-shared
description: Rebuild luminary-shared's dist so app/cms TypeScript picks up shared TYPE/signature changes. Runtime/behavioural changes need no rebuild (Vite consumes shared/src directly via HMR). Use when the user edited shared/ and a consumer's type-check/editor reports stale shared types, or asks "rebuild shared", "after changing shared what do I do", or similar.
---

# rebuild-shared

`app/` and `cms/` consume `shared/src` **directly** at runtime — their Vite config aliases
`luminary-shared` → `../shared/src/index.ts` and `dedupe`s `vue`/`dexie`. So:

- **Behavioural / runtime change in `shared/`** → do **nothing**. Vite HMR (and `vitest`,
  which inherits the alias) picks it up live. No build, no reinstall.
- **Type / signature change in `shared/`** → run `npm run build` in `shared/` so the
  consumers resolve the new types from `dist/index.d.ts` (TypeScript still reads shared
  types from the built `dist`, not source). No reinstall — the consumers symlink `shared`.

This skill is only needed for the second case (or to refresh `dist/` before publishing).

## Procedure

### 1. Build shared

```sh
cd shared && npm run build
```

This runs `vue-tsc + vite build` → `dist/`. If type-check fails, **stop** and report the
errors — don't leave a half-written `dist/`. (Shared's tsconfig is strict — e.g.
`[...new Set(x)]` fails TS2802; use `Array.from(new Set(x))`.)

### 2. Report

Confirm the build succeeded and that `shared/dist/index.d.ts` is fresh. If a consumer's
dev server is running, no restart is needed for the new types (the editor/`type-check`
reads `dist` on next run); a runtime change would already have hot-reloaded.

## What this skill is NOT

- Not a reinstall step. `--install-links` is no longer used; consumers symlink `shared`
  and alias its source. (See root `CLAUDE.md` "Local setup".)
- Not a test runner or dev-server starter — use `/run` or `npm run dev`.
- Not for diagnosing missing runtime changes — those hot-reload from source; if they don't,
  check the consumer's Vite alias/`dedupe`, not a rebuild.
