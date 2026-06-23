# `app/src/ssg/` — Web prerendering (SSG) + dependency-tracked regeneration

This folder holds the **web/SSG tier**: the machinery that prerenders the app's
**public** content to crawlable static HTML and tracks, per page, the data each page
read so we can regenerate only the pages that go stale on a content change.

> **Status (read this first):** Built and working. The content seam is
> **`useContentQuery`** itself, and the **web client uses the identical local-first hybrid
> query as native** — there are no `VITE_BUILD_TARGET` branches in the seam. No-flash
> hydration is achieved by reusing **shared's own response cache**: during the prerender the
> seam fetches via the public `/query` (shared `queryRemote`) and primes the cache via
> `writeResponseCache(structuralCacheKey(...))`; `vite.config.web.ts` serializes those
> `hqcache:*` entries into an inline `<script>` per page; on the client `useHybridQuery({
> cache:true })` reads them synchronously on first render. The seam also captures **facet
> keys** (`facet:<field>:<value>:<lang>` + `doc:<parentId>`, see `facetKeys.ts`) for
> incremental regeneration. Home feeds, the sidebar/topbar chrome, i18n UI strings, and
> SingleContent (article body + SEO + hreflang + tag-page related lists) all prerender.
>
> The bespoke snapshot layer that used to live here (a `queryPublic` fetcher, a `sliceKey`
> hash, a `publicContent` Pinia document-cache, a `publicContentApi` `/search` reader) was
> **deleted** — shared's `queryRemote` / `structuralCacheKey` / `writeResponseCache` replace
> it. i18n + the render language ride vite-ssg's `initialState` (see `main.web.ts`).

Design specs: [`docs/seo-strategy/design-specs/`](../../../docs/seo-strategy/design-specs/).
The web build is driven from a **separate deployment repo** (this repo is a submodule of
it); that repo owns upload-to-R2, edge-cache purge, and the regeneration watcher.

---

## Mental model

- The **web tier is online-only, no service worker** (offline is the native shells' job).
  It exists for SEO/discovery.
- Two data tiers: **public** (prerendered into the static HTML + shared's response-cache
  seed + the dependency manifest) and **private/group-scoped** (NEVER any of those — synced
  to the client at runtime). This folder only ever touches the **public** tier.
- **A prerendered page is a cache keyed by the data it read.** At build time we record,
  per route, a set of coarse **dependency keys**. When content changes, intersect the
  change's keys with the manifest → the exact set of stale pages → regenerate only those.

---

## Commands

Run from `app/`:

| Command | What it does |
| --- | --- |
| `npm run build:web` | **Full** prerender → `dist-web/` (every public route) + `ssg-deps.json` + `sitemap.xml` + `robots.txt`. |
| `SSG_ONLY_ROUTES="/a,/b" npm run build:affected` | **Scoped** rebuild of only those routes; preserves all other files; **merges** their entries into `ssg-deps.json`. |
| `npm run preview:web` | Serve `dist-web/` locally (test in Incognito / unregister old service workers first). |
| `npm run watch:ssg` | **ISR watcher** — long-running. Boots the shared data layer headless and regenerates the affected pages (via `build:affected`) whenever public content changes. Start it BEFORE `build:web` so build-window changes are buffered. |
| `npx vite-node src/ssg/whatChanged.ts <slug>` | Simulate: "if this doc changed, what pages go stale?" (reads `dist-web/ssg-deps.json`). |
| `node src/ssg/verifyIsolation.ts snapshot > before.json` then `… check before.json <routes>` | Prove a scoped rebuild changed ONLY the intended files. |

The native/SPA build (`npm run build` → `dist/`, with its service worker) is **unchanged**
and unaffected by anything here. Web config is `app/vite.config.web.ts`; native is
`app/vite.config.ts`.

---

## File map

| File | Role | Runs in |
| --- | --- | --- |
| `../main.web.ts` | Web entry (`ViteSSG`). Prerender: `initHybridQuery(HttpReq)` so `queryRemote` works in Node, set render language + fill `cmsLanguages` before i18n, serialize render/default langs via `initialState`. Client: restore those + boot the data layer (`clientRuntime`), minus the service worker. Branches only on `import.meta.env.SSR`. | Node + browser |
| `../../vite.config.web.ts` | Web build config: route enumeration, `concurrency:1`, dependency-capture hooks, **per-page `hqcache:*` → inline-script serialization**, writes `ssg-deps.json` / sitemap / robots, scoped-rebuild mode. | Node (build) |
| `polyfills.ts` | Node shims jsdom lacks (localStorage/sessionStorage/matchMedia). Imported first in `main.web.ts`. The `localStorage` shim also backs `writeResponseCache` during the prerender. | Node (prerender) |
| `clientRuntime.ts` | Boots the data layer on the **browser client** after hydration (`init()` + sync + language). Dynamically imported (never in the prerender). | browser |
| `facetKeys.ts` | **Pure** key vocabulary — the single source of truth. `docKey` + `facetsFromSelector`/`facetsFromDoc` (`facet:<field>:<value>:<lang>`), `keysForChangedDoc`, `keysForRecategorization`. No Vue/DOM/Vite deps → the deploy watcher imports this too. | anywhere |
| `dependencyCapture.ts` | **Pure** render-time collector on `globalThis.__SSG_DEPS__`. `reportKeys` is a no-op unless a capture is active (safe on client/native). | Node (build) |
| `computeAffected.ts` | **Pure** `computeAffected(changedKeys, manifest)` + `simulateAffected(doc, manifest, prevDoc?)`. Shared with the watcher. | anywhere |
| `whatChanged.ts` | CLI over `simulateAffected` (dev/inspection). Excluded from app type-check (Node tool). | Node CLI |
| `verifyIsolation.ts` | CLI: sha256 snapshot/diff of `dist-web/**` to assert a scoped rebuild touched only intended files. | Node CLI |
| `watch.ts` | **ISR watcher** — POLLS the anonymous `POST /query` (`queryRemote`, the prerender's own mechanism) for content `updatedTimeUtc` changes, then runs `keysForChangedDoc → computeAffected → build:affected`. Debounced + serialized via the `.ssg-building` lock. | Node service |
| `ssgNodeEnv.ts` | Node prelude for `watch.ts`: installs `window`/`localStorage` (+ event stubs) so `luminary-shared` can be imported for `queryRemote`. No Dexie/IndexedDB (REST-only). MUST be its first import. | Node |

Public-content reads go through shared directly: `queryRemote` (anonymous `POST /query`),
`structuralCacheKey` + `writeResponseCache` (the first-paint seed). There is no app-side
fetcher / slice-key / snapshot store anymore.

---

## How it works

### Prerender (full `build:web`)
1. `vite.config.web.ts` → `includedRoutes` enumerates every public slug via one
   unauthenticated `/search` request (single high-limit request — **not** offset
   pagination, which was nondeterministic and silently capped the site at ~101 of its
   ~1934 real pages).
2. vite-ssg renders each route **one at a time** (`concurrency: 1`, load-bearing).
3. `onBeforePageRender` resets the per-route collector; pages fetch public content
   through `publicContentApi`, which calls `reportKeys([...])` as it reads; `onPageRendered`
   snapshots the collected keys into the manifest.
4. `onFinished` writes `dist-web/ssg-deps.json` (route → keys), plus `sitemap.xml` /
   `robots.txt`.

### Dependency keys (current, Phase 2a)
Coarse and, except for identity, language-scoped (so a change in one language never
invalidates another's pages):
- `doc:<parentId>` — identity (all translations of a post/tag share `parentId`).
- `tag:<parentTagId>:<lang>` — membership in a tag/category grouping.
- `feed:pinned:<lang>`, `feed:newest:<lang>` — the home feeds.

Today the **article** pages record `doc:` keys (their own content). Feed/tag pages aren't
prerendered yet (Phase 2b), so their `feed:`/`tag:` keys don't appear in the manifest yet.

### Scoped rebuild (`build:affected`)
`SSG_ONLY_ROUTES` → render only those routes, `emptyOutDir:false` (keep other files), the
manifest is **merged** (not overwritten), and the prerendered `index.html` is restored if
`/` wasn't in scope (vite's client build re-emits the SPA shell). Re-rendering unchanged
content is byte-idempotent — `verifyIsolation` asserts only the intended files changed.

---

## Gotchas (these bit us — don't repeat them)

- **`vite-ssg` `mock:true` makes `window` defined during the Node prerender.** So
  `ctx.isClient` and `typeof window !== "undefined"` are BOTH true at build time. To tell
  prerender from browser, branch on **`import.meta.env.SSR`** only.
- **In Vue templates, bare `navigator`/`window` resolve to `_ctx.navigator`** (undefined),
  not the global. Compute such things in `setup`/helpers, not inline in the template.
- **`concurrency: 1` is required** for capture correctness — the collector is a single
  shared object; parallel rendering would mis-attribute keys.
- **Never import `src/` modules into `vite.config.web.ts`** (TS project-reference errors);
  the config talks to the collector via `globalThis.__SSG_DEPS__` directly.
- **The client-entry rewrite (`main.ts` → `main.web.ts`) MUST be a `pre`
  `transformIndexHtml` hook.** Vite's `build-html` plugin applies `pre` hooks *before* it
  scans the HTML for its `<script type="module">` entry; the default (post) phase runs in
  `generateBundle`, after the entry is locked in AND the `src` is already rewritten to the
  hashed chunk — so a post-phase `html.replace("/src/main.ts", …)` matches nothing and is a
  silent no-op. Symptom when wrong: the *prerender* uses `main.web.ts` (HTML looks right,
  JS-off works) but the *client* boots `main.ts` — the full native app, with its service
  worker, the Matomo analytics SW registration (`SecurityError … unsupported MIME type
  'text/html'`), and no vite-ssg snapshot hydration. Verify after any change here: a
  `clientRuntime-*.js` chunk exists in `dist-web/assets/`, and `grep -rl "Matomo SW
  registration" dist-web/assets/*.js` is empty.

---

## Parked plan — BLOCKED on branch `1333`

We deliberately **paused** further work here. The clean version of this subsystem needs
**`1333-shared-app-hybrid-mango-queries`** (a `hybridQuery` `/query` template that lets an
unauthenticated build run rich Mango selectors, + `content-publishDate-index`). Building
interim workarounds now would be throwaway. When 1333 merges, do:

1. **Gateway = the `publicContent` Pinia store.** Make it the single seam every component
   uses to read public content (fetch + platform branching web/native/client + key
   capture all in one place). Components stop importing fetchers/keys directly. Pinia
   stores are already singletons and the hydration-snapshot target, so this is the
   idiomatic "one system." Keep `dependencyKeys.ts` + `computeAffected.ts` as **standalone
   pure modules** (the deploy watcher imports them with zero Vue/DOM/Vite deps) — do NOT
   fold them into a god class.
2. **Derive dependency keys from the (hybrid Mango) query selector**, not hardcoded at call
   sites. The gateway turns each query's selector + results into keys via the shared
   vocabulary. Result: rearranging layout or adding a page needs **zero** key edits; only
   a new *data facet* touches the one vocabulary module. This is the fix for "we're
   hardcoding keys" — and it's exactly what needs 1333's rich queries.
3. **Phase 2b — prerender the query-driven pages** (home pinned/newest, tag/category lists,
   related content) via a Node-safe `queryPublic()` POST to `/query` (`hybridQuery`), which
   adds the `feed:`/`tag:` keys to the manifest. Per-user sections (ContinueWatching/
   Listening) stay client-only.

**Why each needs 1333:** the interim `GET /search` can't express the rich selectors
(`parentTags.$elemMatch`, `parentPinned`, …), so neither the feed/tag prerendering (2b)
nor selector-derived keys (step 2) are possible without it.

---

## ISR regeneration watcher (`watch.ts`)

The watcher (`watch.ts`, `npm run watch:ssg`) lives **in this repo** but is a standalone service
the **deploy repo runs** (alongside `build:web`). It **reuses the prerender's own mechanism** —
the anonymous `POST /query` (`queryRemote`) — rather than the socket:
- every `WATCH_POLL_MS` (default 10s) it polls `queryRemote` for content with `updatedTimeUtc`
  newer than the last seen (`{ $and: [{type:content}, {updatedTimeUtc:{$gt: lastSeen}}] }`, sorted
  desc — no `use_index` needed, no full-scan warning);
- per changed doc: `keysForChangedDoc` → `computeAffected(keys, dist-web/ssg-deps.json)` → routes;
- debounced + coalesced (the `availableTranslations` cascade rewrites every sibling at once);
- serialized via the `dist-web/.ssg-building` lock (written by the build, cleared on finish) so it
  never rebuilds while a build is running — including the initial `build:web`, whose build-window
  changes it buffers (`lastSeen` is stamped at launch) and flushes after.

Why polling, not the socket: the socket scopes live `data` by rooms/accessMap (separate from REST
query permissions) and runs the doc through shared's Dexie live-sync — extra coupling for a service
whose job is just "what changed since T?". Polling `queryRemote` is the exact public, anonymous
path the prerender already uses. Cost: up to `WATCH_POLL_MS` latency vs an instant push. (Override
the starting cutoff with `WATCH_SINCE=<epoch-ms>`.)

**Deploy contract:** start `watch:ssg` BEFORE `build:web`. The watcher regenerates `dist-web`
only and logs the changed routes; the deploy repo's uploader pushes those files to R2 and
**purges exactly those edge paths**.

**Still TODO (v1 gaps):** deletes (`DeleteCmd` → remove `<slug>.html` + its manifest entry +
regenerate co-listed pages) and redirects (`RedirectDto` → purge the source path; runtime SPA
handles the redirect). No prev-doc state, so a recategorization regenerates the doc's own + new
facets' pages; the OLD facet's page is covered by the periodic full `build:web`.

---

## Pointers
- Design specs: [`docs/seo-strategy/design-specs/`](../../../docs/seo-strategy/design-specs/)
  (phase-1 / phase-2 / phase-3) and the implementation plan in
  `docs/seo-strategy/implementation-plans/phase-1.md`.
- Two-tier data + offline + platform split: phase-3 spec.
