---
name: rebuild-shared
description: Rebuild luminary-shared and reinstall it in app/ and cms/ via --install-links so the consumers pick up local changes. Use when the user has edited files in shared/ and wants to test or run the app/cms against the new code, or asks to "rebuild shared", "sync shared into app/cms", "after changing shared what do I do", or similar.
---

# rebuild-shared

Build `shared/` and reinstall it into `app/` and `cms/` so consumers see the local changes. Without this, the consumers keep using the cached `shared/dist/` from `node_modules/luminary-shared/` and your edits do nothing at runtime.

## Why `--install-links` is non-negotiable

Plain `npm install ../shared` symlinks the package — Dexie loses its package boundary and **IndexedDB reactivity breaks silently**. Always use `--install-links`. This is also why this repo's setup wizard and post-checkout hook use it.

## Procedure

### 1. Confirm scope

Check which consumers are present before rebuilding. Run in parallel:

- `ls /Users/dirk/projects/bccsa/luminary/shared/package.json` — confirm shared exists
- `ls /Users/dirk/projects/bccsa/luminary/app/package.json` — confirm app exists
- `ls /Users/dirk/projects/bccsa/luminary/cms/package.json` — confirm cms exists
- `git -C /Users/dirk/projects/bccsa/luminary/shared status --short` — confirm there actually are local changes worth rebuilding (skip rebuild if clean and the user didn't insist)

### 2. Build shared

```sh
cd /Users/dirk/projects/bccsa/luminary/shared && npm run build
```

This runs `vue-tsc + vite build` → `dist/`. If type-check fails, **stop**. Report the type errors to the user — don't reinstall a broken build.

### 3. Reinstall in app and cms

Run **sequentially** (they read the same `shared/dist/`, but parallelizing here gains nothing and complicates failure attribution):

```sh
cd /Users/dirk/projects/bccsa/luminary/app && npm install --install-links ../shared
cd /Users/dirk/projects/bccsa/luminary/cms && npm install --install-links ../shared
```

Use `npm install --install-links ../shared` — not `npm ci`. `npm ci` would wipe and reinstall the whole tree from `package-lock.json`, which is slow and unnecessary.

If a consumer has uncommitted lockfile changes after this, that's expected — the lockfile records the new tarball hash from the local build. Don't revert it.

### 4. Verify and report

```sh
ls /Users/dirk/projects/bccsa/luminary/app/node_modules/luminary-shared/dist/index.js
ls /Users/dirk/projects/bccsa/luminary/cms/node_modules/luminary-shared/dist/index.js
```

Both should exist with a fresh mtime. Report:

- Shared build: OK / failed
- App reinstall: OK / failed
- CMS reinstall: OK / failed

If the dev server for `app/` or `cms/` is already running, remind the user it needs to be restarted — Vite caches the resolved package between starts.

## What this skill is NOT

- Not a test runner. Don't run vitest after reinstall unless asked.
- Not a dev-server starter. Use `/run` or `app/`'s `npm run dev` for that.
- Not for production builds. This is the local-dev install-link path only.
