# SSG / ISR — full context & decisions

Branch: **`1672-app-research-and-implement-vue-ssr-for-ssgisr`**

This is the narrative companion to [`README.md`](./README.md) (the how-to). It captures
**why** the web/SSG tier looks the way it does, the **decisions** we made (and the
alternatives we rejected), how the design **evolved**, and **where it stands**. If anything
here disagrees with the older lower sections of the README, this document is authoritative —
the README's "How it works / Dependency keys / Parked plan" sections predate the
response-cache rewrite and are stale (see [§9](#9-doc-debt)).

---

## 1. The goal

Luminary is an offline-first PWA. The native shells (Capacitor) cover logged-in,
offline use. But the app was **invisible to search engines and link previews** — everything
rendered client-side after a JS boot + data sync, so a crawler saw an empty shell.

This branch adds a **web tier**: the app's **public** content prerendered to **crawlable
static HTML** (SSG), plus **incremental regeneration** (ISR) so that when an editor changes
content, only the affected static pages are rebuilt — quickly, not via a full site rebuild.

Non-goals: the web tier is **online-only, no service worker, no private/group-scoped
content**. Offline and authed use stay the native shells' job.

---

## 2. Mental model

- **Two data tiers.** **Public** content is prerendered into the static HTML (+ a first-paint
  cache seed + a dependency manifest). **Private / group-scoped** content is *never*
  prerendered — it syncs to the client at runtime. This folder only ever touches the public
  tier. Anonymous access maps to the default/public group mappings on the API.
- **A prerendered page is a cache keyed by the data it read.** At build time each route
  records a set of coarse **dependency keys**. When a doc changes, intersect the change's keys
  with the manifest → the exact set of stale pages → regenerate only those.
- **Web client == native client.** After hydration the web build runs the *identical*
  local-first data layer as native (minus the service worker). SSG is a build-time concern,
  not a parallel runtime.

---

## 3. How it evolved (the commit story)

In order on this branch (`git log main..HEAD`):

1. `0e90097b` **SEO prerendering (SSG) for the web tier** — the first cut: vite-ssg, a web
   entry, route enumeration, prerender the article pages.
2. `c4653b46` **dependency-tracked regeneration (Phase 2a)** — the capture/manifest/
   `computeAffected` infra + `build:affected` scoped rebuild.
3. `abb2b0e4` **query-driven prerendering via the `useContentQuery` seam (Phase 2b)** — feeds
   /tag pages prerender; keys derived from the query, not hardcoded.
4. `cecad70d` **web/SSG content via shared's response cache; web client == native path** —
   the big simplification (see [§5.2](#52-no-flash-hydration--shareds-response-cache)).
5. `ebcd5b12` **i18n SSR** — prerendered UI strings render in the right language.
6. `58ebf0fb` **route SingleContent through the seam; delete the public-content snapshot** —
   removed the bespoke snapshot layer.
7. `9860576b` **cut the hydration seed size to stop full-build OOM**.
8. `7efcb91d` **prerender the public main routes** `/explore` and `/watch`.
9. `1976ae3a` **real `<a href>` links for the desktop sidebar nav** (so web routing/crawling
   works, not just JS RouterLinks).
10. `6bf444f4` **ISR watcher — poll `/query`** for content changes → regenerate affected pages.
11. `e765c371` add `todos.md`.

The arc: a **bespoke public-content snapshot system** (a `queryPublic` fetcher, a `sliceKey`
hash, a `publicContent` Pinia store, a `publicContentApi` `/search` reader) was built first,
then **deleted** once we realized shared already had the primitives to do it more simply.

---

## 4. Current architecture (authoritative)

### 4.1 The seam — `useContentQuery`
`app/src/composables/useContentQuery.ts` is the single content-reading seam. It has **two
paths**:
- **Prerender (Node), `if (import.meta.env.SSR)`:** in `onServerPrefetch`, fetch via shared
  `queryRemote` (anonymous `POST /query` → public tier), set the out ref so the page renders
  with data, prime the response cache (§5.2), and `reportKeys([...])` for the manifest.
  A module-level `ssrChain` serializes prefetches so chained queries (e.g. HomePagePinned:
  pinned categories → their content) resolve in order.
- **Browser + native (else):** plain `useHybridQuery(buildQuery, options)` — the *same*
  local-first query for both. No `VITE_BUILD_TARGET` branch.

### 4.2 No-flash hydration — shared's response cache
The mechanism that lets a prerendered page hydrate **without a flash** and **without a
bespoke snapshot store**:
- During prerender the seam calls `writeResponseCache(structuralCacheKey(query, cacheId),
  { local: docs, remote: [] }, limit, cacheStripFields)`.
- `vite.config.web.ts` reads the polyfilled `localStorage` `hqcache:*` entries the render
  produced and injects them as an inline classic `<script>localStorage.setItem(...)` in
  `<head>` — which runs *before* the deferred ES-module entry.
- On the client, `useHybridQuery({ cache: true })` reads that cache **synchronously in its
  constructor** → the first client render shows the prerendered docs immediately.
- `structuralCacheKey` (shared; was the app-side `sliceKey`) normalizes the selector and
  strips runtime values (incl. the volatile `sessionNow`) so the key is the query *shape*.

`writeResponseCache` / `readResponseCache` / `structuralCacheKey` / `queryRemote` /
`initHybridQuery` / `HttpReq` are all **public `luminary-shared` exports**.

### 4.3 i18n SSR (`main.web.ts`)
UI strings live in CouchDB Language docs. The prerender fetches languages via `queryRemote`,
sets `cmsLanguages` + `appLanguageIdsAsRef` **before** `app.use(initI18n())` (so the first
render emits real strings, not `menu.*` keys), and serializes all language docs via vite-ssg's
`initialState` — with `translations` stripped from all but the render + default language to
bound page weight. The render language also rides `initialState`.

### 4.4 Incremental regeneration — facet keys + manifest + scoped rebuild
- **Vocabulary** (`facetKeys.ts`, pure, the single source of truth):
  - `doc:<parentId>` — **identity**. Every rendered tile reports it; all translations of a
    post/tag share `parentId` (so this also covers hreflang reciprocity).
  - `facet:<field>:<value>:<lang>` — **membership**, derived generically from the localizing
    fields in `FACET_FIELDS = [parentId, parentTags, parentPinned]`.
  - Two entry points, mapping the **same** whitelisted fields the **same** way:
    `facetsFromSelector(selector, lang)` (capture side — a query's deps) and
    `facetsFromDoc(doc)` / `keysForChangedDoc(doc)` (watcher side — a changed doc's keys),
    plus `keysForRecategorization(prev, next)`.
  - Deliberately excluded: time/publish/language-priority fields (`publishDate`/`expiryDate`/
    `status`/`availableTranslations`) and `parent*Type` — scheduled-publish and the
    translations cascade are handled by the periodic full rebuild, not change events.
- **Capture** (`dependencyCapture.ts`): a render-time collector on `globalThis.__SSG_DEPS__`;
  `reportKeys` is a no-op unless a capture is active (safe on client/native).
- **Manifest**: `dist-web/ssg-deps.json` = `route → keys[]`.
- **Affected set** (`computeAffected.ts`, pure): `computeAffected(changedKeys, manifest)` →
  routes whose key-set intersects; `simulateAffected(doc, manifest, prevDoc?)` for inspection.
- **Scoped rebuild** (`build:affected`): `SSG_ONLY_ROUTES=...` renders only those routes,
  `emptyOutDir:false` (keep other files), **merges** the manifest (not overwrites), restores
  the SPA `index.html` if `/` wasn't in scope. Re-rendering unchanged content is
  byte-idempotent (`verifyIsolation.ts` asserts only intended files changed).

### 4.5 ISR watcher — `watch.ts` (`npm run watch:ssg`)
A standalone Node service the **deploy repo runs**, started **before** `build:web`. Every
`WATCH_POLL_MS` (default 10s) it polls the anonymous `POST /query` (`queryRemote`) for content
with `updatedTimeUtc` newer than the last seen → `keysForChangedDoc` →
`computeAffected(ssg-deps.json)` → debounced, coalesced, lock-serialized `build:affected`.
- Serialized via a `dist-web/.ssg-building` lock (written by the build, cleared on finish) so
  it never rebuilds during a build — including the initial `build:web`, whose build-window
  changes it buffers (`lastSeen` stamped at launch; `WATCH_SINCE=<epoch-ms>` override) and
  flushes after.
- `ssgNodeEnv.ts` is a minimal Node prelude (window/localStorage/event stubs) so
  `luminary-shared` can be imported for `queryRemote` — **REST-only, no Dexie/IndexedDB**.

### 4.6 Deploy topology
The web build is driven from a **separate deployment repo**; **this repo is a submodule of
it**. The deploy repo owns: upload `dist-web/` → R2, edge-cache purge of exactly the changed
paths, and running `watch:ssg` alongside `build:web`. This repo owns the prerender, the
manifest, and the watcher logic. The prerender authenticates as **anonymous** (default group
mappings) to read public content.

---

## 5. Decisions we made (and what we rejected)

| # | Decision | Why / rejected alternative |
| --- | --- | --- |
| 1 | **Incremental regeneration** (facet-key manifest), not always-full-rebuild | A full ~1934-route build is slow; ISR keeps edits near-instant. User explicitly chose "keep incremental." |
| 2 | **No-flash hydration via shared's response cache** | We wanted clean hydration *without* the complexity of a bespoke snapshot. Discovered `useHybridQuery({cache:true})` already reads `hqcache:*` synchronously — so the prerender just primes it. Rejected: a custom snapshot store + custom hydration. |
| 3 | **Web client == native path** (no `VITE_BUILD_TARGET` branches in the seam) | Fits the house style; one code path to reason about. The earlier web-specific branch was deleted. |
| 4 | **Delete the bespoke snapshot layer** (`queryPublic`, `sliceKey`, `publicContent` Pinia store, `publicContentApi`) | Superseded by shared's `queryRemote` / `structuralCacheKey` / `writeResponseCache`. Less code, one system. |
| 5 | **Derive dependency keys generically from the query selector** | Rearranging layout / adding a page needs **zero** key edits — only a new *data facet* touches `facetKeys.ts`. Rejected: hardcoding keys per page (brittle). |
| 6 | **ISR via polling `queryRemote`, NOT the socket** | We first built a socket watcher (boot the shared data layer headless + Dexie liveQuery). It connected and received `data`, but the change never rendered: the socket scopes live data by rooms/accessMap (separate from REST query permissions) and routes it through shared's Dexie live-sync — extra coupling for a "what changed since T?" service. Polling reuses the prerender's exact public, anonymous path. Cost: up to `WATCH_POLL_MS` latency vs an instant push. |
| 7 | **Strip `text` from the cache seed where it isn't needed at first paint** (`cacheStripFields:["text"]`) | The full-build OOM: SingleContent's translations query was serializing every sibling language's full body into each page's seed (~105KB/page) → heap blew up ~820/1934 pages. Fix dropped the seed to ~39KB; the live query still keeps `text` for language switches; the article's own body keeps its `text`. Also: fetch languages once/build; `NODE_OPTIONS=--max-old-space-size`. |
| 8 | **Prerender the main public routes first** (`/explore`, `/watch`) | The shell/feeds must be crawlable, not just slug pages. Listing pages render their tile collections. |
| 9 | **Real `<a href>` links in the sidebar/bottom nav** (RouterLink `custom` → `<a>`) | Web routing + crawlability need real anchors; only Search (a modal trigger) stays a button. |
| 10 | **`concurrency: 1`** in vite-ssg | Load-bearing: the dependency collector is one shared object; parallel rendering mis-attributes keys. |
| 11 | **Enumerate routes via one high-limit `/search` request**, not offset pagination | Pagination was nondeterministic and silently capped the site at ~101 of ~1934 pages. |
| 12 | **No service worker on the web tier** | Senior's call (Capacitor owns native/offline). The client-entry rewrite must drop the SW + Matomo SW registration. |
| 13 | **Run the watcher + upload/purge from a separate deploy repo** | Keeps cloud-specific (R2/Cloudflare) concerns out of the app repo; this repo stays the source of the prerender + watcher logic. |

> Relationship to branch **1333 / HybridQuery**: an earlier README section parked this work
> as "BLOCKED on 1333" (a `/query` template for rich anonymous Mango selectors). That landed —
> HybridQuery is on `main` and was rebased in — so the block is gone; the response-cache
> architecture (decisions 2–5) is built on it.

---

## 6. Status

**Working & verified at build level:** type-check, scoped `build:affected`, and the native
build are green. Article/tag pages prerender content + SEO + hreflang + related lists with the
`hqcache` first-paint seed. `/explore` + `/watch` prerender. Sidebar uses real anchors. i18n
SSR renders strings in the right language.

**ISR verified end-to-end:** the polling watcher detected a real changed doc on staging,
computed the affected route, ran `build:affected`, and the page regenerated.

**OOM:** root-caused and fixed (seed 105KB → 39KB). The remaining confirmation is a **clean
full `build:web` to completion** across all ~1934 routes against a production-sized dataset.

**Still the user's to run (browser-level):** `preview:web` in Incognito (a stale native SW
will otherwise hijack localhost) — confirm no flash, no hydration warnings, language switch,
404, and nav links. Note `VITE_API_URL` must point at a running API; local dev seed slugs
differ from staging.

---

## 7. Open gaps / TODO

From `todos.md` + the watcher's v1 gaps:
- **Per-locale homepage** rendering for locales.
- **Cache eviction hook** for the CDN (a Cloudflare/Wrangler script the SSG can call to evict
  updated docs) — likely lives in the deploy repo.
- **First-load empty-state flash** for a split second — investigate.
- **Watcher: deletes** (`DeleteCmd` → remove `<slug>.html` + its manifest entry + regenerate
  co-listed pages) and **redirects** (`RedirectDto` → purge the source path; the runtime SPA
  handles the redirect).
- **No prev-doc state** in the watcher: a recategorization regenerates the doc's own + new
  facets' pages; the **old** facet's page is covered by the periodic full `build:web`.

---

## 8. Gotchas (these bit us)

- `vite-ssg` `mock:true` makes `window` defined during the Node prerender, so `ctx.isClient`
  and `typeof window !== "undefined"` are BOTH true at build time → tell prerender from browser
  with **`import.meta.env.SSR` only**.
- Vue SSR does **not run watchers** → render-time-readable data must be a `computed`, not a
  watch-bound ref (this was the `contentByTag` / SingleContent `content` fix).
- In Vue templates, bare `navigator`/`window` resolve to `_ctx.*` (undefined) — compute in
  `setup`, not inline.
- The client-entry rewrite (`main.ts` → `main.web.ts`) **must be a `pre` `transformIndexHtml`
  hook**, or the prerender uses `main.web.ts` but the *client* boots the full native `main.ts`
  (with its SW + Matomo SW registration). Verify: a `clientRuntime-*.js` chunk exists in
  `dist-web/assets/` and no `"Matomo SW registration"` string is bundled.
- Never import `src/` modules into `vite.config.web.ts` (TS project-reference errors) — talk to
  the collector via `globalThis.__SSG_DEPS__`.
- Don't import `@/globalConfig` in the watcher (heavy browser module — `new Image()`/`document`
  at load); get `apiUrl` from `loadEnv`.

---

## 9. Doc debt

[`README.md`](./README.md) has a **current** top status banner + file map, but its lower
sections — **"How it works" step 3** (`publicContentApi`/`reportKeys`), **"Dependency keys
(Phase 2a)"** (`tag:`/`feed:` keys), and **"Parked plan — BLOCKED on 1333"** — predate the
response-cache rewrite and are **stale**. The current vocabulary is `facet:<field>:<value>:
<lang>` + `doc:<parentId>` (see `facetKeys.ts`), reads go through `queryRemote` (not
`publicContentApi`), and 1333 is no longer a blocker. Worth a README cleanup pass.

---

## 10. Pointers
- How-to / commands / file map: [`README.md`](./README.md).
- Design specs & plans: [`docs/seo-strategy/design-specs/`](../../../docs/seo-strategy/design-specs/),
  `docs/seo-strategy/implementation-plans/phase-1.md`.
- Seam: `app/src/composables/useContentQuery.ts`. Web entry: `app/src/main.web.ts`.
  Web build config: `app/vite.config.web.ts`. Pure infra: `facetKeys.ts` /
  `dependencyCapture.ts` / `computeAffected.ts`. Watcher: `watch.ts` + `ssgNodeEnv.ts`.
