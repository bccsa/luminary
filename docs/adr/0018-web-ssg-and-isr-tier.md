# 12. Web SSG and ISR tier

Date: 2026-07-06

## Status

Accepted

## Context

The app is an offline-first Vue PWA. The native/Capacitor shells serve logged-in and offline use, but public pages rendered client-side after JavaScript boot, so crawlers and link unfurlers saw little useful content.

We need a crawlable web tier without forking the app's runtime data path or adding cloud-provider deployment code to the app repo.

## Decision

Add a separate web/SSG tier beside the native build:

- Native keeps `vite.config.ts`, `src/main.ts`, `dist/`, and the service worker.
- Web uses `vite.config.web.ts`, `src/main.web.ts`, `vite-ssg`, and writes `dist-web/` with no service worker.
- Public pages are prerendered from anonymous `/query` access only; private/group-scoped content remains runtime-only.
- Hydration reuses `luminary-shared`'s existing response cache (`hqcache:*`) instead of an app-specific snapshot store.
- The shared route table lives in `src/router/routes.ts`; web adds locale-prefixed public static routes with `src/router/localizedRoutes.ts`.
- Each prerendered route records dependency keys in `ssg-deps.json`. The deployment repo's polling watcher reads changed content/redirect/delete docs, computes affected routes, and runs scoped `SSG_ONLY_ROUTES=… npm run build:web` rebuilds.
- Uploading `dist-web/`, deleting remote objects, and purging Cloudflare/R2 edge paths remain the deploy repo's responsibility.

## Consequences

- Public pages have crawlable HTML, SEO head tags, sitemap/robots files, static redirects, and per-language static entry points.
- Native and web builds stay isolated enough that web changes do not silently add a service worker or SSG-only boot logic to native.
- The web client still hydrates into the same shared local-first data layer as native, reducing duplicate app logic.
- The ISR watcher is deliberately polling-based: it reuses the prerender's anonymous REST path and avoids socket/access-map/Dexie coupling. The tradeoff is polling latency.
- Build sidecars (`ssg-deps.json`, route/redirect/facet indexes) are part of the deploy contract for incremental regeneration.
