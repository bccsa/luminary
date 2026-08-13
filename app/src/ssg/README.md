# `app/src/ssg/` — Web prerendering (SSG)

This folder holds the **web/SSG tier**: the machinery that prerenders the app's
**public** content to crawlable static HTML and records, per page, the data each page
read.

> **Status:** Built and working. The content seam is **`useContentQuery`** itself, and
> the **web client uses the identical local-first hybrid query as the normal SPA** — there are
> no `VITE_BUILD_TARGET` branches in the seam. No-flash hydration is achieved by reusing
> **shared's own response cache** (see [§No-flash hydration](#no-flash-hydration--shareds-response-cache)).
> The bespoke snapshot layer that used to live here (`queryPublic`, `sliceKey`,
> a `publicContent` Pinia store, a `publicContentApi` `/search` reader) was **deleted** —
> shared's `queryRemote` / `structuralCacheKey` / `writeResponseCache` replace it.

This repo's web build produces `dist-web/` and its sidecar files only — deployment and
incremental-regeneration orchestration happen downstream, out of scope for this repo.

---

## The goal

Luminary is an offline-first PWA; the existing app already covers logged-in, offline use
via its service worker + local-first sync. But the app was **invisible to search engines
and link previews** — everything rendered client-side after a JS boot + data sync, so a
crawler saw an empty shell.

This branch adds a **web tier**: the app's **public** content prerendered to **crawlable
static HTML** (SSG). Incremental regeneration (ISR) rebuilds are triggered externally via
`SSG_ONLY_ROUTES`.

Non-goals: the web tier is **online-only, no service worker, no private/group-scoped
content**. Offline and authed use stay the normal SPA's job.

---

## Mental model

- **Two data tiers.** **Public** content is prerendered into the static HTML (+ a
  first-paint cache seed + a dependency manifest). **Private / group-scoped** content is
  _never_ prerendered — it syncs to the client at runtime. This folder only ever touches
  the public tier. Anonymous access maps to the default/public group mappings on the API.
- **A prerendered page is a cache keyed by the data it read.** At build time each route
  records a set of coarse **dependency keys**. When a doc changes, intersect the change's
  keys with the manifest → the exact set of stale pages → regenerate only those.
- **Web client == normal SPA client.** After hydration the web build runs the _identical_
  local-first data layer as the normal SPA (minus the service worker). SSG is a build-time
  concern, not a parallel runtime.

---

## Commands

Run from `app/`:

| Command                                     | What it does                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run build:web`                         | **Full** prerender → `dist-web/` (every public route) + `ssg-deps.json` + `sitemap.xml` + `robots.txt` + `llms.txt`. |
| `SSG_ONLY_ROUTES="/a,/b" npm run build:web` | **Scoped** rebuild of only those routes; preserves all other files; **merges** their entries into `ssg-deps.json`.   |
| `npm run preview:web`                       | Serve `dist-web/` locally (test in Incognito / unregister old service workers first).                                |

The normal SPA build (`npm run build` → `dist/`, with its service worker) is
**unchanged** and unaffected by anything here. Web config is `app/vite.config.web.ts`;
the normal SPA is `app/vite.config.ts`.

---

## File map

| File                           | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Runs in          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `../main.web.ts`               | Web entry (`ViteSSG`). Prerender: `initHybridQuery(HttpReq)` so `queryRemote` works in Node, set render language + fill `cmsLanguages` before i18n, add locale-prefixed static routes, serialize render/default langs via `initialState`. Client: restore those + boot the data layer (`clientRuntime`), minus the service worker. Branches only on `import.meta.env.SSR`.                                                                                                                                              | Node + browser   |
| `../router/localizedRoutes.ts` | Pure route helper for locale-prefixed public static routes (`/<code>`, `/<code>/explore`, `/<code>/watch`). Imported by the web entry only; normal SPA routes stay unchanged.                                                                                                                                                                                                                                                                                                                                           | Node + browser   |
| `../../vite.config.web.ts`     | Web build config: route enumeration, `concurrency:1`, dependency-capture hooks, **per-page `hqcache:*` → inline-script serialization**, writes `ssg-deps.json` / `ssg-route-index/` / `ssg-redirect-index.json` / `ssg-doc-facets/` / `ssg-delete-queue/` / sitemap / robots / static redirect HTML, scoped-rebuild mode.                                                                                                                                                                                               | Node (build)     |
| `polyfills.ts`                 | Node shims jsdom lacks (localStorage/sessionStorage/matchMedia). Imported first in `main.web.ts`. The `localStorage` shim also backs `writeResponseCache` during the prerender.                                                                                                                                                                                                                                                                                                                                         | Node (prerender) |
| `clientRuntime.ts`             | `initSsgClient()` boots the data layer on the **browser client** after hydration (`init()` + sync + language). Dynamically imported (never in the prerender).                                                                                                                                                                                                                                                                                                                                                           | browser          |
| `facetKeys.ts`                 | **Pure** key vocabulary. `docKey` + `facetsFromSelector` / `facetsFromDoc` (`facet:<field>:<value>:<lang>`). No Vue/DOM/Vite deps.                                                                                                                                                                                                                                                                                                                                                                                        | anywhere         |
| `docFacetShards.ts`            | **Pure** shard-id function (`docFacetShard`, fnv1a32 mod `DOC_FACETS_SHARD_COUNT`) for `ssg-doc-facets/`. No Vue/DOM/Vite/fs deps.                                                                                                                                                                                                                                                                                                                                                                                       | anywhere         |
| `dependencyCapture.ts`         | **Pure** render-time reporter (`reportKeys`) writing to `globalThis.__SSG_DEPS__`. No-op unless a capture is active (safe on client/the normal SPA). The collector itself is initialised/reset by `vite.config.web.ts`.                                                                                                                                                                                                                                                                                                 | Node (build)     |
| `routeIndex.ts`                | Pure content-id/parent-id → route sidecar helper for DeleteCmd handling and slug-change cleanup.                                                                                                                                                                                                                                                                                                                                                                                                                        | Node             |
| `routeIndexShards.ts`          | **Pure** shard-id function (`routeIndexShard`, fnv1a32 mod `ROUTE_INDEX_SHARD_COUNT`) for `ssg-route-index/`. No Vue/DOM/Vite/fs deps.                                                                                                                                                                                                                                                                                                                                                                                   | anywhere         |
| `redirectIndex.ts`             | Pure redirect id → `{ slug, status }` sidecar helper, so redirect DeleteCmds can remove static redirect files and a downstream consumer can apply the right HTTP status.                                                                                                                                                                                                                                                                                                                                                | Node             |
| `redirectHtml.ts`              | Pure static redirect renderer (`redirectHtml` + `redirectFile` + `redirectStatus`) shared by full builds and the watcher. Maps `redirectType` to a 301/302.                                                                                                                                                                                                                                                                                                                                                             | Node             |
| `queryDrain.ts`                | Pure keyset-pagination helper (`drainQuery`, `enumeratePublicContent`, `enumerateDeleteCmds`) over anonymous `/query`, used by route/language/redirect/delete-cmd enumeration in `vite.config.web.ts`.                                                                                                                                                                                                                                                                                                                  | Node (build)     |
| `deleteQueue.ts`               | Pure DeleteCmd → durable pending-delete queue-entry resolver (`resolveContentDeleteQueueEntry` / `resolveRedirectDeleteQueueEntry` / `buildDeleteQueue`) for `ssg-delete-queue/`. Slug-first (new DeleteCmds self-describe their route); falls back to `routeIndex.ts`/`redirectIndex.ts`'s legacy sidecars only for slug-less DeleteCmds. Entries also carry the DeleteCmd's own `deleteReason`/`language`/`memberOf`/`newMemberOf` — this sidecar never leaves the server, so there's no size pressure to strip them. | Node             |

**Naming convention:** identifiers that discriminate "which side of the prerender is
this" use `Ssg`/`SSG` (`initSsgClient`, `ssgRouteLang`, `__SSG_DEPS__`), never
`isWeb`/`isSSR` — `vite-ssg` is the actual mechanism, so that's the name that stays
consistent everywhere in this folder. `import.meta.env.SSR` is the one exception
(a Vite built-in, not ours to rename); `VITE_BUILD_TARGET === "web"` elsewhere in
`app/src/` is a separate, deliberate product/build-target name (staying "web" is
correct there — see [The goal](#the-goal)).

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
  the manifest. A per-route chain (`ssrChains.ts`, keyed by route path) serializes
  prefetches so chained queries (e.g. SingleContent: content → translations → tags →
  related content) resolve in order.
- **Browser + the normal SPA (else):** plain `useHybridQuery(buildQuery, options)` — the _same_
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

**Article-text dedup:** a long article's `text` would otherwise ship twice — once as
rendered HTML, once JSON-escaped inside the inline cache script. `SingleContent.vue`
passes `ssrCacheStripFields: ["text"]` (a `useContentQuery` option, SSR-write-only) so the
prerender omits `text` from the cache seed; on the client, `recoverSsrArticleText`
(`src/util/ssrTextRecovery.ts`) reads it back from a `[data-ssr-article-text]` marker on
the rendered article `<div>` before first render, so hydration still matches the server
output. A plain client-side navigation has no such DOM to recover from, so
`cacheStripFields` (which affects both writers) is left untouched — only the SSR write is
stripped.

### Fail-loud prerender — render diagnostics

A prerender query that **rejects** is collected during the build via
`renderDiagnostics.ts` (`globalThis.__SSG_RENDER_ISSUES__`) and fails the build at the
end, unless `SSG_STRICT=0` downgrades that to a warning. This turns silent query failures
— which would otherwise emit HTML with missing sections — into loud build errors.

A **provably-empty** selector (e.g. an empty `$in`) is reported as a **deduplicated
warning** instead, and never fails the build: an empty selector is often a legitimate
empty state during a prerender — a personalised feed with no user state, a tag with no
tagged documents, a related-content lookup with nothing to relate. So a build with zero
rejected queries succeeds regardless of how many provably-empty warnings it logged.

### i18n SSR (`main.web.ts`)

UI strings live in CouchDB Language docs. The prerender fetches languages via
`queryRemote`, sets `cmsLanguages` + `appLanguageIdsAsRef` **before** `app.use(initI18n())`
(so the first render emits real strings, not `menu.*` keys), and serializes all language
docs via vite-ssg's `initialState` — with `translations` stripped from all but the render
and default language to bound page weight. The render language also rides `initialState`
as `renderLang` (the language `_id`, often a UUID) plus a human-readable `renderLangName`
companion for anyone inspecting the inlined state.

### Incremental regeneration — facet keys + manifest + scoped rebuild

- **Vocabulary** (`facetKeys.ts`, pure, the single source of truth):
    - `doc:<parentId>` — **identity**. Every rendered tile reports it; all translations of
      a post/tag share `parentId` (so this also covers hreflang reciprocity).
    - `facet:<field>:<value>:<lang>` — **membership**, derived generically from the
      localizing fields in `FACET_FIELDS = [parentId, parentTags, parentPinned]`.
    - Two entry points, mapping the **same** whitelisted fields the **same** way:
      `facetsFromSelector(selector, lang)` (capture side — a query's deps, used here)
      and `facetsFromDoc(doc)` (watcher side — a changed doc's keys).
    - Deliberately excluded: time/publish/language-priority fields (`publishDate` /
      `expiryDate` / `status` / `availableTranslations`) and `parent*Type` —
      `publishDate`/`expiryDate` threshold crossings are caught by the watcher's
      wall-clock poll; `status`/`availableTranslations` change only with a doc
      mutation, whose unconditional `doc:<parentId>` key already invalidates every
      page that rendered it.
- **Capture** (`dependencyCapture.ts`): a render-time reporter on
  `globalThis.__SSG_DEPS__`; `reportKeys` is a no-op unless a capture is active.
- **Manifest**: `dist-web/ssg-deps.json` = `route → keys[]`.
- **Route index**: `dist-web/ssg-route-index/` = content id / parent id → slug routes,
  used so DeleteCmds and slug changes can remove stale static content files. **Sharded**,
  not one file — same scheme as the doc facet snapshot below (`routeIndexShards.ts`'s
  `routeIndexShard()`, fnv1a32-mod-shardCount, `index.json` holds `{ shardCount,
algorithm }`). A `docId` may hash to a different shard depending on whether it's a
  content id or a parent id, but `resolveContentDelete` only needs the one shard file for
  whichever id it was given — it checks that shard's `content` and `parent` maps and only
  falls through empty if neither has it.
- **Redirect index**: `dist-web/ssg-redirect-index.json` = redirect id →
  `{ slug, status }`, used so redirect DeleteCmds and slug changes can remove stale
  static redirect files. `status` (301/302, from `redirectType` via
  `redirectHtml.ts`'s `redirectStatus()`) carries the real HTTP status a
  `<meta refresh>` page can't set on its own — this sidecar (and a matching
  `x-redirect-status` meta tag baked into each redirect HTML file itself) are the
  two places that status is available without re-fetching the doc.
- **Doc facet snapshot**: `dist-web/ssg-doc-facets/` = content id → last-known
  `parentId` / `parentTags` / `parentPinned` / `language`, so recategorization invalidates
  both old and new facet pages. **Sharded**, not one file: `index.json` is `{ shardCount,
algorithm }` (`docFacetShards.ts`'s `docFacetsIndex()`); each doc's entry lives in
  `<shard>.json`, `shard = docFacetShard(docId)` — a 2-hex-digit fnv1a32-mod-shardCount
  bucket (`00`..`3f` at the default 64 shards), constant regardless of site size. A build
  only reads/writes the shards containing docs whose route was actually rendered THIS
  build (`renderedRouteSet` in `vite.config.web.ts`) — so a scoped rebuild touches a
  handful of small shard files, not one file that grows without bound as the site grows.
  A consumer that wants a doc's old facet snapshot computes its shard directly (no
  directory listing) and can process shards independently instead of loading the whole
  dataset at once.
- **Delete queue**: `dist-web/ssg-delete-queue/<deleteCmdId>.json`, one file per
  DeleteCmd id, holding the resolved `{ docType, docId, parentId?, routes, files }`
  plus the DeleteCmd's own `deleteReason`/`language`/`memberOf`/`newMemberOf` — a
  _durable_ record of pending deletes, not just a lookup table. Before this sidecar
  existed, "a doc was deleted" was only a transient fact observed while polling
  DeleteCmd docs; a crash between seeing the DeleteCmd and finishing the downstream
  delete could lose that pending action. DeleteCmd docs are never pruned from CouchDB,
  so the fact of the delete is never lost — but nothing recorded whether it had been
  _acted on_. A consumer reads this queue, performs the actual delete, then removes
  that one file itself once done; a crash at any point just leaves the file for the
  next pass.
    - Resolution is **slug-first**: `DeleteCmdDto.slug` (added alongside `.language`)
      lets a Content/Redirect DeleteCmd self-describe its own route with no sidecar
      lookup. Falls back to `routeIndex.ts`/`redirectIndex.ts`'s legacy sidecars only
      for DeleteCmds created before `.slug` existed (`deleteQueue.ts`'s
      `resolveContentDeleteQueueEntry` / `resolveRedirectDeleteQueueEntry`).
    - **A Content-translation DeleteCmd's `docType` is the _parent's_ type** (`Post` or
      `Tag`), never `"content"` — the permission system has no ACLs on Content itself
      (`api/src/db/db.service.ts`'s `insertDeleteCmd`). `/query` requires `docType` as
      a scalar equality value (no `$in`), so enumerating every Content-related delete
      takes **three** drains (`Post`, `Tag`, `Redirect`), not one
      (`enumerateDeleteCmds` in `queryDrain.ts`).
    - **Flat, not sharded** — unlike `ssg-route-index/`/`ssg-doc-facets/`, this sidecar
      is never uploaded anywhere, so sharding's rationale (bound what a
      consumer must load/rewrite) doesn't need a bucketing scheme when each entry
      already is its own file: "processed" is a plain `rm <id>.json`, with no
      read-merge-write race against other entries sharing a file.
    - **Full build**: re-derives the queue from every currently-existing DeleteCmd doc.
      Safe because full builds are already rare (restart-skip avoids them on ordinary
      restarts) and a storage-delete/CDN-purge is an idempotent no-op against an
      already-resolved entry — no watermark/cursor needed.
    - **Scoped rebuild**: merges in only the entries for `SSG_DELETE_CMD_IDS=...`
      (comma-separated DeleteCmd ids, same one-shot-parameter shape as
      `SSG_ONLY_ROUTES`) — a deleted route was never rendered this build, so there's
      no "was this route rendered" signal to gate a merge on the way
      `writeRouteIndex()`/`writeDocFacets()` do; the caller passes the triggering
      DeleteCmd ids explicitly instead. Empty (or unset) on a purely content-driven
      scoped rebuild skips the drain entirely.
    - Known asymmetry, not fixed here: `ssg-route-index/` is cumulative (entries
      persist across full builds), so its legacy fallback works indefinitely.
      `ssg-redirect-index.json` is fully overwritten every full build with only
      currently-active redirects, so a legacy (pre-`.slug`) Redirect DeleteCmd is only
      resolvable via that fallback until the next full build after its deletion —
      small and bounded, and consistent with `routeIndex.ts`'s own doc comment already
      tolerating this class of gap.
- **Scoped rebuild** (`SSG_ONLY_ROUTES=... npm run build:web`): renders only those routes,
  `emptyOutDir:false` (keep other files), **merges** the manifest (not overwrites),
  restores the SPA `index.html` if `/` wasn't in scope.

### Build scope

This repo owns the prerender and its generated sidecars only. Uploading `dist-web/`,
edge-cache purges, and ISR watching/polling logic are out of scope for this repo. The
prerender authenticates as **anonymous** (default group mappings) to read public content.

---

## Decisions (and what we rejected)

| #   | Decision                                                                                                                                            | Why / rejected alternative                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Incremental regeneration** (facet-key manifest), not always-full-rebuild                                                                          | A full ~1934-route build is slow; ISR keeps edits near-instant.                                                                                                                                                                                                                                                                                   |
| 2   | **No-flash hydration via shared's response cache**                                                                                                  | Clean hydration _without_ a bespoke snapshot. `useHybridQuery({cache:true})` already reads `hqcache:*` synchronously — so the prerender just primes it.                                                                                                                                                                                           |
| 3   | **Web client == normal SPA path** (no `VITE_BUILD_TARGET` branches in the seam)                                                                     | One code path to reason about. The earlier web-specific branch was deleted.                                                                                                                                                                                                                                                                       |
| 4   | **Delete the bespoke snapshot layer** (`queryPublic`, `sliceKey`, `publicContent` Pinia store, `publicContentApi`)                                  | Superseded by shared's `queryRemote` / `structuralCacheKey` / `writeResponseCache`. Less code, one system.                                                                                                                                                                                                                                        |
| 5   | **Derive dependency keys generically from the query selector**                                                                                      | Rearranging layout / adding a page needs **zero** key edits — only a new _data facet_ touches `facetKeys.ts`. Rejected: hardcoding keys per page.                                                                                                                                                                                                 |
| 6   | **Expose ISR via polling `queryRemote`, NOT the socket**                                                                                            | A socket-based watch connects and receives `data`, but the change never renders (socket scopes by rooms/accessMap + Dexie live-sync — extra coupling). The public, anonymous `/query` path is polling-friendly with no such coupling.                                                                                                            |
| 7   | **Strip `text` from the cache seed where unneeded at first paint** (`cacheStripFields:["text"]`)                                                    | Full-build OOM: SingleContent's translations query serialized every sibling language's full body into each page's seed (~105KB/page) → heap blew up ~820/1934 pages. Fix dropped the seed to ~39KB; the live query still keeps `text` for language switches.                                                                                      |
| 8   | **Prerender the main public routes** (`/explore`, `/watch`)                                                                                         | The shell/feeds must be crawlable, not just slug pages.                                                                                                                                                                                                                                                                                           |
| 9   | **Real `<a href>` links in the sidebar/bottom nav** (RouterLink `custom` → `<a>`)                                                                   | Web routing + crawlability need real anchors; only Search (a modal trigger) stays a button.                                                                                                                                                                                                                                                       |
| 10  | **`concurrency: 1`** in vite-ssg                                                                                                                    | Load-bearing: the dependency collector is one shared object; parallel rendering mis-attributes keys.                                                                                                                                                                                                                                              |
| 11  | **Enumerate routes via keyset pagination over `POST /query`** (`queryDrain.ts`, `QUERY_PAGE_SIZE = 500`), not a single high-limit `/search` request | The old `/search` reader was deleted (see status note above). Offset pagination was nondeterministic and silently capped the site at ~101 of ~1934 pages; keyset pagination over `/query` drains the full set deterministically.                                                                                                                  |
| 12  | **No service worker on the web tier**                                                                                                               | The native build owns offline use. The client-entry rewrite must drop the SW + Matomo SW registration.                                                                                                                                                                                                                                            |
| 13  | **Keep watching/upload/purge orchestration out of this repo**                                                                                       | Keeps deployment-specific concerns out of the app repo.                                                                                                                                                                                                                                                                                            |
| 14  | **A durable, file-based delete queue** (`ssg-delete-queue/`), not a DB-poll-only cursor                                                             | A crash between "a watch saw the DeleteCmd" and "the downstream delete finished" must not lose the pending action. DeleteCmd docs are a permanent CouchDB ledger, so the _fact_ was never lost — but nothing recorded whether it had been acted on. Rejected: re-deriving pending deletes purely from an in-memory poll cursor each restart.      |

---

## Status

**Working & verified at build level:** type-check, scoped `SSG_ONLY_ROUTES=... npm run build:web`, and the
normal SPA build are green. Article/tag pages prerender content + SEO + hreflang + related
lists with the `hqcache` first-paint seed. `/explore`, `/watch`, and locale-prefixed
static variants prerender. Sidebar uses real anchors. i18n SSR renders strings in the
right language. Full builds also emit static meta-refresh redirect files.

**ISR verified end-to-end:** a real changed doc on staging triggered
`SSG_ONLY_ROUTES=... npm run build:web`, and the page regenerated. Content
delete support is implemented via `ssg-route-index/`; recategorization old-facet
coverage is backed by `ssg-doc-facets/`. Live API verification is still user-run.

**Delete queue (`ssg-delete-queue/`):** implemented and unit-tested (`deleteQueue.spec.ts`,
`queryDrain.spec.ts`); verified at build level only (full + scoped `build:web`).
End-to-end verification against real storage is still user-run.

**404 error page:** `NotFoundPage` is prerendered to `dist-web/404.html` (via a static
`/404` route in `routes.ts` with `meta.prerender`; vite-ssg's flat `dirStyle` writes
`/404` → `404.html`) for use as a custom error page on unmatched paths. It is
deliberately excluded from `sitemap.xml` and from the locale-prefixed variants — only
the default-language `404.html` is emitted (per-language `/<code>/404` deferred; see
`tobediscussed.md`).

**OOM:** root-caused and fixed (seed 105KB → 39KB). The remaining confirmation is a clean
full `build:web` to completion across all ~1934 routes against a production-sized dataset.

**Still the user's to run (browser-level):** `preview:web` in Incognito (a stale normal SPA SW
will otherwise hijack localhost) — confirm no flash, no hydration warnings, language
switch, 404, and nav links. Note `VITE_API_URL` must point at a running API.

---

## Open gaps / TODO

- **Serving layer** — the static redirect files are meta-refresh HTML served as HTTP 200.
  Turning them into real 301/302s, mapping the extension-less object names storage is keyed
  by, and serving `404.html` on a miss all need a serving layer that doesn't exist yet,
  outside this repo's scope. `ssg-redirect-index.json` already carries the status each
  redirect should be given.

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
  works) but the _client_ boots `main.ts` — the full normal SPA, with its service worker,
  the Matomo analytics SW registration, and no vite-ssg snapshot hydration. Verify: a
  `clientRuntime-*.js` chunk exists in `dist-web/assets/`, and
  `grep -rl "Matomo SW registration" dist-web/assets/*.js` is empty.
- Never import app-heavy `src/` modules into `vite.config.web.ts` (TS project-reference
  errors) — talk to the collector via `globalThis.__SSG_DEPS__`. Pure Node-safe helpers
  must be explicitly listed in `tsconfig.node.json` if the config imports them.

---

## Pointers

- Seam: `app/src/composables/useContentQuery.ts`. Web entry: `app/src/main.web.ts`.
  Web build config: `app/vite.config.web.ts`.
- Pure infra: `facetKeys.ts` / `dependencyCapture.ts` /
  `redirectHtml.ts` / `routeIndex.ts` / `redirectIndex.ts` / `queryDrain.ts` /
  `deleteQueue.ts`.
- Every file in this folder has a matching `*.spec.ts` (run with
  `npm run test -- src/ssg`); `clientRuntime.spec.ts` and `polyfills.spec.ts` mock
  or reset the browser globals they touch since the real thing only exists at
  prerender/hydration time, not under plain Vitest.
