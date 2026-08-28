# 18. Web SSG and ISR tier

Date: 2026-07-06

## Status

Accepted

## Context

The app is an offline-first Vue PWA. The native build serves logged-in and offline use, but public pages rendered client-side after JavaScript boot, so crawlers and link unfurlers saw little useful content.

We need a crawlable web tier without forking the app's runtime data path or adding cloud-provider deployment code to the app repo.

## Decision

Add a separate web/SSG tier beside the native build:

- Native keeps `vite.config.ts`, `src/main.ts`, `dist/`, and the service worker.
- Web uses `vite.config.web.ts`, `src/main.web.ts`, `vite-ssg`, and writes `dist-web/` with no service worker.
- Public pages are prerendered from anonymous `/query` access only; private/group-scoped content remains runtime-only.
- Hydration reuses `luminary-shared`'s existing response cache (`hqcache:*`) instead of an app-specific snapshot store.
- The shared route table lives in `src/router/routes.ts`; web adds locale-prefixed public static routes with `src/router/localizedRoutes.ts`.
- Each prerendered route records dependency keys in `ssg-deps.json`, enabling scoped `SSG_ONLY_ROUTES=… npm run build:web` rebuilds of just the affected routes.
- The app repo also emits a durable, file-based pending-delete queue (`ssg-delete-queue/`), keyed by each DeleteCmd's own id, so pending deletes stay resolvable from disk rather than only from an in-memory or DB-cursor position. A delete-triggered scoped rebuild passes the relevant DeleteCmd ids via `SSG_DELETE_CMD_IDS=…`, alongside `SSG_ONLY_ROUTES`.
- Uploading `dist-web/`, deleting remote objects, and purging edge-cache entries are out of scope for this repo.

## Consequences

- Public pages have crawlable HTML, SEO head tags, sitemap/robots files, static redirects, and per-language static entry points.
- Native and web builds stay isolated enough that web changes do not silently add a service worker or SSG-only boot logic to native.
- The web client still hydrates into the same shared local-first data layer as native, reducing duplicate app logic.
- The public data path (anonymous `/query`) is polling-friendly by design, so incremental rebuilds need no socket/access-map/Dexie coupling into this repo.
- Build sidecars (`ssg-deps.json`, route/redirect/facet indexes, and the delete queue `ssg-delete-queue/`) are stable output artifacts this repo commits to maintaining for incremental regeneration.
