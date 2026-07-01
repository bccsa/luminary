# `app/src/ssg/` — Web prerendering (SSG) + dependency-tracked regeneration (ISR)

This folder holds the **web/SSG tier**: the machinery that prerenders the app's
**public** content to crawlable static HTML and tracks, per page, the data each page
read so we can regenerate only the pages that go stale on a content change.

> **Status:** Built and working. The content seam is **`useContentQuery`** itself, and
> the **web client uses the identical local-first hybrid query as native** — there are
> no `VITE_BUILD_TARGET` branches in the seam. No-flash hydration is achieved by reusing
> **shared's own response cache** (see [§No-flash hydration](#no-flash-hydration--shareds-response-cache)).
> The bespoke snapshot layer that used to live here (`queryPublic`, `sliceKey`,
> a `publicContent` Pinia store, a `publicContentApi` `/search` reader) was **deleted** —
> shared's `queryRemote` / `structuralCacheKey` / `writeResponseCache` replace it.

The web build is driven from a **separate deployment repo** (this repo is a submodule of
it); that repo owns upload-to-R2, edge-cache purge, and running the regeneration watcher.

---

## The goal

Luminary is an offline-first PWA; the native shells (Capacitor) cover logged-in, offline
use. But the app was **invisible to search engines and link previews** — everything
rendered client-side after a JS boot + data sync, so a crawler saw an empty shell.

This branch adds a **web tier**: the app's **public** content prerendered to **crawlable
static HTML** (SSG), plus **incremental regeneration** (ISR) so that when an editor
changes content, only the affected static pages are rebuilt — quickly, not via a full
site rebuild.

Non-goals: the web tier is **online-only, no service worker, no private/group-scoped
content**. Offline and authed use stay the native shells' job.

---

## Mental model

- **Two data tiers.** **Public** content is prerendered into the static HTML (+ a
  first-paint cache seed + a dependency manifest). **Private / group-scoped** content is
  _never_ prerendered — it syncs to the client at runtime. This folder only ever touches
  the public tier. Anonymous access maps to the default/public group mappings on the API.
- **A prerendered page is a cache keyed by the data it read.** At build time each route
  records a set of coarse **dependency keys**. When a doc changes, intersect the change's
  keys with the manifest → the exact set of stale pages → regenerate only those.
- **Web client == native client.** After hydration the web build runs the _identical_
  local-first data layer as native (minus the service worker). SSG is a build-time
  concern, not a parallel runtime.

---

## Commands

Run from `app/`:

| Command                                                                                      | What it does                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build:web`                                                                          | **Full** prerender → `dist-web/` (every public route) + `ssg-deps.json` + `sitemap.xml` + `robots.txt`.                                                                                                                           |
| `SSG_ONLY_ROUTES="/a,/b" npm run build:affected`                                             | **Scoped** rebuild of only those routes; preserves all other files; **merges** their entries into `ssg-deps.json`.                                                                                                                |
| `npm run preview:web`                                                                        | Serve `dist-web/` locally (test in Incognito / unregister old service workers first).                                                                                                                                             |
| `npm run watch:ssg`                                                                          | **ISR watcher** — long-running. Boots the shared data layer headless and regenerates the affected pages (via `build:affected`) whenever public content changes. Start it BEFORE `build:web` so build-window changes are buffered. |
| `npx vite-node src/ssg/whatChanged.ts <slug>`                                                | Simulate: "if this doc changed, what pages go stale?" (reads `dist-web/ssg-deps.json`).                                                                                                                                           |
| `node src/ssg/verifyIsolation.ts snapshot > before.json` then `… check before.json <routes>` | Prove a scoped rebuild changed ONLY the intended files.                                                                                                                                                                           |

The native/SPA build (`npm run build` → `dist/`, with its service worker) is
**unchanged** and unaffected by anything here. Web config is `app/vite.config.web.ts`;
native is `app/vite.config.ts`.

---

## File map

| File                           | Role                                                                                                                                                                                                                                                                                                                                                                        | Runs in          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `../main.web.ts`               | Web entry (`ViteSSG`). Prerender: `initHybridQuery(HttpReq)` so `queryRemote` works in Node, set render language + fill `cmsLanguages` before i18n, add locale-prefixed static routes, serialize render/default langs via `initialState`. Client: restore those + boot the data layer (`clientRuntime`), minus the service worker. Branches only on `import.meta.env.SSR`.  | Node + browser   |
| `../router/localizedRoutes.ts` | Pure route helper for locale-prefixed public static routes (`/<code>`, `/<code>/explore`, `/<code>/watch`). Imported by the web entry only; native routes stay unchanged.                                                                                                                                                                                                   | Node + browser   |
| `../../vite.config.web.ts`     | Web build config: route enumeration, `concurrency:1`, dependency-capture hooks, **per-page `hqcache:*` → inline-script serialization**, writes `ssg-deps.json` / `ssg-route-index.json` / `ssg-doc-facets.json` / sitemap / robots / static redirect HTML, scoped-rebuild mode.                                                                                             | Node (build)     |
| `polyfills.ts`                 | Node shims jsdom lacks (localStorage/sessionStorage/matchMedia). Imported first in `main.web.ts`. The `localStorage` shim also backs `writeResponseCache` during the prerender.                                                                                                                                                                                             | Node (prerender) |
| `clientRuntime.ts`             | Boots the data layer on the **browser client** after hydration (`init()` + sync + language). Dynamically imported (never in the prerender).                                                                                                                                                                                                                                 | browser          |
| `facetKeys.ts`                 | **Pure** key vocabulary — the single source of truth. `docKey` + `facetsFromSelector` / `facetsFromDoc` (`facet:<field>:<value>:<lang>`), `keysForChangedDoc`, `keysForRecategorization`. No Vue/DOM/Vite deps → the deploy watcher imports this too.                                                                                                                       | anywhere         |
| `dependencyCapture.ts`         | **Pure** render-time reporter (`reportKeys`) writing to `globalThis.__SSG_DEPS__`. No-op unless a capture is active (safe on client/native). The collector itself is initialised/reset by `vite.config.web.ts`.                                                                                                                                                             | Node (build)     |
| `computeAffected.ts`           | **Pure** `computeAffected(changedKeys, manifest)` + `simulateAffected(doc, manifest, prevDoc?)`. Shared with the watcher.                                                                                                                                                                                                                                                   | anywhere         |
| `routeIndex.ts`                | Pure content-id/parent-id → route sidecar helper for DeleteCmd handling.                                                                                                                                                                                                                                                                                                    | Node             |
| `whatChanged.ts`               | CLI over `simulateAffected` (dev/inspection). Excluded from app type-check (Node tool).                                                                                                                                                                                                                                                                                     | Node CLI         |
| `verifyIsolation.ts`           | CLI: sha256 snapshot/diff of `dist-web/**` to assert a scoped rebuild touched only intended files.                                                                                                                                                                                                                                                                          | Node CLI         |
| `redirectHtml.ts`              | Pure static redirect renderer (`redirectHtml` + `redirectFile`) shared by full builds and the watcher.                                                                                                                                                                                                                                                                      | Node             |
| `watch.ts`                     | **ISR watcher** — POLLS the anonymous `POST /query` (`queryRemote`, the prerender's own mechanism) for content/redirect/delete `updatedTimeUtc` changes, then runs content through previous/new facet snapshots → `computeAffected → build:affected`, writes/removes redirect HTML, and prunes deleted content routes. Debounced + serialized via the `.ssg-building` lock. | Node service     |
| `ssgNodeEnv.ts`                | Node prelude for `watch.ts`: installs `window`/`localStorage` (+ event stubs) so `luminary-shared` can be imported for `queryRemote`. No Dexie/IndexedDB (REST-only). MUST be its first import.                                                                                                                                                                             | Node             |

Public-content reads go through shared directly: `queryRemote` (anonymous `POST /query`),
`structuralCacheKey` + `writeResponseCache` (the first-paint seed). There is no app-side
fetcher / slice-key / snapshot store.

---

## Current architecture

### The seam — `useContentQuery`

`app/src/composables/useContentQuery.ts` is the single content-reading seam, with **two
paths**:

- **Prerender (Node), `if (import.meta.env.SSR)`:** in `onServerPrefetch`, fetch via
  shared `queryRemote` (anonymous `POST /query` → public tier), set the out ref so the
  page renders with data, prime the response cache (below), and `reportKeys([...])` for
  the manifest. A module-level `ssrChain` serializes prefetches so chained queries (e.g.
  HomePagePinned: pinned categories → their content) resolve in order.
- **Browser + native (else):** plain `useHybridQuery(buildQuery, options)` — the _same_
  local-first query for both. No `VITE_BUILD_TARGET` branch.

### No-flash hydration — shared's response cache

Lets a prerendered page hydrate **without a flash** and **without a bespoke snapshot
store**:

- During prerender the seam calls
  `writeResponseCache(structuralCacheKey(query, cacheId), { local: docs, remote: [] }, limit, cacheStripFields)`.
- `vite.config.web.ts` reads the polyfilled `localStorage` `hqcache:*` entries the render
  produced and injects them as an inline classic `<script>localStorage.setItem(...)` in
  `<head>` — which runs _before_ the deferred ES-module entry.
- On the client, `useHybridQuery({ cache: true })` reads that cache **synchronously in
  its constructor** → the first client render shows the prerendered docs immediately.
- `structuralCacheKey` (shared; was the app-side `sliceKey`) normalizes the selector and
  strips runtime values (incl. the volatile `sessionNow`) so the key is the query _shape_.

`writeResponseCache` / `readResponseCache` / `structuralCacheKey` / `queryRemote` /
`initHybridQuery` / `HttpReq` are all **public `luminary-shared` exports**.

### i18n SSR (`main.web.ts`)

UI strings live in CouchDB Language docs. The prerender fetches languages via
`queryRemote`, sets `cmsLanguages` + `appLanguageIdsAsRef` **before** `app.use(initI18n())`
(so the first render emits real strings, not `menu.*` keys), and serializes all language
docs via vite-ssg's `initialState` — with `translations` stripped from all but the render
and default language to bound page weight. The render language also rides `initialState`.

### Incremental regeneration — facet keys + manifest + scoped rebuild

- **Vocabulary** (`facetKeys.ts`, pure, the single source of truth):
    - `doc:<parentId>` — **identity**. Every rendered tile reports it; all translations of
      a post/tag share `parentId` (so this also covers hreflang reciprocity).
    - `facet:<field>:<value>:<lang>` — **membership**, derived generically from the
      localizing fields in `FACET_FIELDS = [parentId, parentTags, parentPinned]`.
    - Two entry points, mapping the **same** whitelisted fields the **same** way:
      `facetsFromSelector(selector, lang)` (capture side — a query's deps) and
      `facetsFromDoc(doc)` / `keysForChangedDoc(doc)` (watcher side — a changed doc's keys),
      plus `keysForRecategorization(prev, next)`.
    - Deliberately excluded: time/publish/language-priority fields (`publishDate` /
      `expiryDate` / `status` / `availableTranslations`) and `parent*Type` —
      scheduled-publish and the translations cascade are handled by the periodic full
      rebuild, not change events.
- **Capture** (`dependencyCapture.ts`): a render-time reporter on
  `globalThis.__SSG_DEPS__`; `reportKeys` is a no-op unless a capture is active.
- **Manifest**: `dist-web/ssg-deps.json` = `route → keys[]`.
- **Route index**: `dist-web/ssg-route-index.json` = content id / parent id → slug routes,
  used only so DeleteCmds can remove static content files.
- **Doc facet snapshot**: `dist-web/ssg-doc-facets.json` = content id → last-known
  `parentId` / `parentTags` / `parentPinned` / `language`, so recategorization invalidates
  both old and new facet pages.
- **Affected set** (`computeAffected.ts`, pure): `computeAffected(changedKeys, manifest)`
  → routes whose key-set intersects; `simulateAffected(doc, manifest, prevDoc?)` for
  inspection.
- **Scoped rebuild** (`build:affected`): `SSG_ONLY_ROUTES=...` renders only those routes,
  `emptyOutDir:false` (keep other files), **merges** the manifest (not overwrites),
  restores the SPA `index.html` if `/` wasn't in scope. Re-rendering unchanged content is
  byte-idempotent (`verifyIsolation.ts` asserts only intended files changed).

### ISR watcher — `watch.ts` (`npm run watch:ssg`)

A standalone Node service the **deploy repo runs**, started **before** `build:web`. Every
`WATCH_POLL_MS` (default 10s) it polls the anonymous `POST /query` (`queryRemote`) for
content/redirect/delete docs with `updatedTimeUtc` newer than the last seen. Content docs
use `ssg-doc-facets.json` to emit old∪new recategorization keys when a previous snapshot
exists, then go through `computeAffected(ssg-deps.json)` → debounced, coalesced,
lock-serialized `build:affected`; redirects write/remove their static HTML; DeleteCmds
prune content route files + manifest/index entries, then regenerate surviving co-listed
pages.

- Serialized via a `dist-web/.ssg-building` lock (written by the build, cleared on
  finish) so it never rebuilds during a build — including the initial `build:web`, whose
  build-window changes it buffers (`lastSeen` stamped at launch; `WATCH_SINCE=<epoch-ms>`
  override) and flushes after.
- `ssgNodeEnv.ts` is a minimal Node prelude (window/localStorage/event stubs) so
  `luminary-shared` can be imported for `queryRemote` — **REST-only, no Dexie/IndexedDB**.

Why polling, not the socket: the socket scopes live `data` by rooms/accessMap (separate
from REST query permissions) and runs the doc through shared's Dexie live-sync — extra
coupling for a service whose job is just "what changed since T?". Polling reuses the
prerender's exact public, anonymous path. Cost: up to `WATCH_POLL_MS` latency vs an
instant push.

**Deploy contract:** start `watch:ssg` BEFORE `build:web`. The watcher regenerates
`dist-web` only and logs the changed routes; the deploy repo's uploader pushes those
files to R2 and **purges exactly those edge paths**.

### Deploy topology

The web build is driven from a **separate deployment repo**; **this repo is a submodule
of it**. The deploy repo owns: upload `dist-web/` → R2, edge-cache purge of exactly the
changed paths, and running `watch:ssg` alongside `build:web`. This repo owns the
prerender, the manifest, and the watcher logic. The prerender authenticates as
**anonymous** (default group mappings) to read public content.

---

## Decisions (and what we rejected)

| #   | Decision                                                                                                           | Why / rejected alternative                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Incremental regeneration** (facet-key manifest), not always-full-rebuild                                         | A full ~1934-route build is slow; ISR keeps edits near-instant.                                                                                                                                                                                              |
| 2   | **No-flash hydration via shared's response cache**                                                                 | Clean hydration _without_ a bespoke snapshot. `useHybridQuery({cache:true})` already reads `hqcache:*` synchronously — so the prerender just primes it.                                                                                                      |
| 3   | **Web client == native path** (no `VITE_BUILD_TARGET` branches in the seam)                                        | One code path to reason about. The earlier web-specific branch was deleted.                                                                                                                                                                                  |
| 4   | **Delete the bespoke snapshot layer** (`queryPublic`, `sliceKey`, `publicContent` Pinia store, `publicContentApi`) | Superseded by shared's `queryRemote` / `structuralCacheKey` / `writeResponseCache`. Less code, one system.                                                                                                                                                   |
| 5   | **Derive dependency keys generically from the query selector**                                                     | Rearranging layout / adding a page needs **zero** key edits — only a new _data facet_ touches `facetKeys.ts`. Rejected: hardcoding keys per page.                                                                                                            |
| 6   | **ISR via polling `queryRemote`, NOT the socket**                                                                  | A socket watcher connected and received `data`, but the change never rendered (socket scopes by rooms/accessMap + Dexie live-sync — extra coupling). Polling reuses the prerender's public, anonymous path. Cost: up to `WATCH_POLL_MS` latency.             |
| 7   | **Strip `text` from the cache seed where unneeded at first paint** (`cacheStripFields:["text"]`)                   | Full-build OOM: SingleContent's translations query serialized every sibling language's full body into each page's seed (~105KB/page) → heap blew up ~820/1934 pages. Fix dropped the seed to ~39KB; the live query still keeps `text` for language switches. |
| 8   | **Prerender the main public routes** (`/explore`, `/watch`)                                                        | The shell/feeds must be crawlable, not just slug pages.                                                                                                                                                                                                      |
| 9   | **Real `<a href>` links in the sidebar/bottom nav** (RouterLink `custom` → `<a>`)                                  | Web routing + crawlability need real anchors; only Search (a modal trigger) stays a button.                                                                                                                                                                  |
| 10  | **`concurrency: 1`** in vite-ssg                                                                                   | Load-bearing: the dependency collector is one shared object; parallel rendering mis-attributes keys.                                                                                                                                                         |
| 11  | **Enumerate routes via one high-limit `/search` request**, not offset pagination                                   | Pagination was nondeterministic and silently capped the site at ~101 of ~1934 pages.                                                                                                                                                                         |
| 12  | **No service worker on the web tier**                                                                              | Capacitor owns native/offline. The client-entry rewrite must drop the SW + Matomo SW registration.                                                                                                                                                           |
| 13  | **Run the watcher + upload/purge from a separate deploy repo**                                                     | Keeps cloud-specific (R2/Cloudflare) concerns out of the app repo.                                                                                                                                                                                           |

---

## Status

**Working & verified at build level:** type-check, scoped `build:affected`, and the
native build are green. Article/tag pages prerender content + SEO + hreflang + related
lists with the `hqcache` first-paint seed. `/explore`, `/watch`, and locale-prefixed
static variants prerender. Sidebar uses real anchors. i18n SSR renders strings in the
right language. Full builds also emit static meta-refresh redirect files.

**ISR verified end-to-end:** the polling watcher detected a real changed doc on staging,
computed the affected route, ran `build:affected`, and the page regenerated. Content
delete support is implemented via `ssg-route-index.json`; recategorization old-facet
coverage is backed by `ssg-doc-facets.json`. Live API verification is still user-run.

**OOM:** root-caused and fixed (seed 105KB → 39KB). The remaining confirmation is a clean
full `build:web` to completion across all ~1934 routes against a production-sized dataset.

**Still the user's to run (browser-level):** `preview:web` in Incognito (a stale native SW
will otherwise hijack localhost) — confirm no flash, no hydration warnings, language
switch, 404, and nav links. Note `VITE_API_URL` must point at a running API.

---

## Open gaps / TODO

- **Cache eviction hook** for the CDN (a Cloudflare/Wrangler script the SSG can call to
  evict updated docs) — likely lives in the deploy repo.

---

## Gotchas (these bit us — don't repeat them)

- `vite-ssg` `mock:true` makes `window` defined during the Node prerender, so
  `ctx.isClient` and `typeof window !== "undefined"` are BOTH true at build time → tell
  prerender from browser with **`import.meta.env.SSR` only**.
- Vue SSR does **not run watchers** → render-time-readable data must be a `computed`, not
  a watch-bound ref (this was the `contentByTag` / SingleContent `content` fix).
- In Vue templates, bare `navigator`/`window` resolve to `_ctx.*` (undefined) — compute in
  `setup`, not inline in the template.
- The client-entry rewrite (`main.ts` → `main.web.ts`) **must be a `pre`
  `transformIndexHtml` hook**. Vite's `build-html` plugin applies `pre` hooks _before_ it
  scans the HTML for its `<script type="module">` entry; the default (post) phase runs in
  `generateBundle`, after the entry is locked in AND the `src` is rewritten to the hashed
  chunk — so a post-phase `html.replace("/src/main.ts", …)` matches nothing (silent
  no-op). Symptom when wrong: the _prerender_ uses `main.web.ts` (HTML looks right, JS-off
  works) but the _client_ boots `main.ts` — the full native app, with its service worker,
  the Matomo analytics SW registration, and no vite-ssg snapshot hydration. Verify: a
  `clientRuntime-*.js` chunk exists in `dist-web/assets/`, and
  `grep -rl "Matomo SW registration" dist-web/assets/*.js` is empty.
- Never import app-heavy `src/` modules into `vite.config.web.ts` (TS project-reference
  errors) — talk to the collector via `globalThis.__SSG_DEPS__`. Pure Node-safe helpers
  must be explicitly listed in `tsconfig.node.json` if the config imports them.
- Don't import `@/globalConfig` in the watcher (heavy browser module — `new Image()` /
  `document` at load); get `apiUrl` from `loadEnv`.

---

## Pointers

- Seam: `app/src/composables/useContentQuery.ts`. Web entry: `app/src/main.web.ts`.
  Web build config: `app/vite.config.web.ts`.
- Pure infra: `facetKeys.ts` / `dependencyCapture.ts` / `computeAffected.ts` /
  `redirectHtml.ts` / `routeIndex.ts`. Watcher: `watch.ts` + `ssgNodeEnv.ts`.
