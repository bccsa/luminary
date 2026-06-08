# Phase 1 Implementation Plan — SEO-Safe Prerendering & Clean Hydration

**Status:** Draft for review (pending **D6**).
**Spec:** [phase-1-prerendering-seo-hydration.md](../design-specs/phase-1-prerendering-seo-hydration.md)
**Scope:** Make every **public, content-bearing** page in `app/` exist as crawlable
static HTML (full content + SEO metadata, visible with JS disabled) that hydrates
into the SPA with **no duplicate fetch and no mismatch** — *without touching the
existing SPA build that the future Capacitor/native shells will wrap.*

**Out of scope (explicitly):** Phase 2 (dependency keys, `build:affected`, watcher,
regeneration) and Phase 3 (private/group tier, sessions, offline, native bundling,
download CTA). Forward-compatible seams are added only where free.

---

## 0. The central decision (everything hangs off this)

The POC satisfied the spec's §3.2 "one fetch path for build + runtime" for free
because both its build and its browser fetched from an **API**. **Our public pages
read from Dexie/IndexedDB**, which **does not exist in Node at build time**:

- `app/src/pages/SingleContent/SingleContent.vue` → `useDexieLiveQuery(mangoToDexie(db.docs,{slug…}))`
- `app/src/components/HomePage/HomePagePinned.vue` / `HomePageNewest` → `useDexieLiveQueryWithDeps(db.docs …)`

So Phase 1 re-homes the **public tier's reads** onto the API. Both build and runtime
hit the **same `GET /search` endpoint** (parity per §3.2): the **build** calls it as
a plain unauthenticated `fetch` in Node (no `shared`, no socket), and the **client**
uses the existing **`ApiLiveQuery`** (REST + socket) seeded from the restored
snapshot. The **hybrid Mango query** swaps in later behind the same seam. The
**native shells keep Dexie** (Phase 3). This satisfies §3.2 (no build↔runtime drift
*within the web tier*) and matches the decided platform split (Phase 3 §3.5).
**No `shared/` modifications are required** (see WS-2).

This is the diagram's *"query endpoint … for consistency across the app … basically
public content."*

---

## 1. Where code lands (deploy topology)

The initiative is driven from a **separate deployment repo with this repo as a git
submodule**.

- **In THIS repo (`app/`):** the in-app SSG harness — ViteSSG entry, web vite
  config, exported routes, head/SEO layer (incl. JSON-LD), public-tier data seam,
  the `build:web` script.
- **In the DEPLOY repo:** the orchestration — docker build that runs the prerender,
  diff-aware upload to Cloudflare R2, edge-cache purge, desktop-executable upload +
  download button, native/OTA (capgo). *Phase 1 produces a build the deploy repo
  consumes; we do not build the orchestration here.*

---

## 2. The build-target split (resolves D5 — protects the native/Capacitor base)

No Capacitor exists in `app/` yet; today's single `vite build` SPA is the future
native base. We keep it the **untouched default** and add the web/SSG path
**additively**.

```
app/src/
  app-core.ts     NEW  shared factory: builds the Vue app (App.vue + i18n + pinia +
                       head + routes) and accepts an injected publicContentSource.
                       No mount, no I/O.
  main.ts         KEEP SPA/native entry: createApp + Dexie source + FULL offline
                       init (shared init(), initSync, auth, analytics) + mount('#app').
                       → npm run dev + future Capacitor. Behaviour unchanged.
  main.web.ts     NEW  web/SSG entry: export const createApp = ViteSSG(App,{routes},setup)
                       - PRERENDER pass (Node): public REST snapshot only —
                         no sync / socket / auth / Dexie / service worker.
                       - CLIENT pass (isClient): the FULL app — auth, sync, IndexedDB,
                         private-tier layering after mount — exactly like native,
                         MINUS the service worker.

app/
  vite.config.ts      KEEP native/default: PWA plugin as today, entry main.ts.
                       `npm run build` output identical to today.
  vite.config.web.ts  NEW  vite-ssg plugin, NO PWA/SW, entry main.web.ts, route
                       enumeration. `npm run build:web` → the prerendered web bundle.
```

### Build comparison

| Concern | Native/SPA build (default, Capacitor base) | Web/SSG build |
|---|---|---|
| Mount | `createApp().mount()` in `main.ts` | `ViteSSG(...)` in `main.web.ts` |
| Runtime sync / auth / IndexedDB | Yes | **Yes** (client pass) |
| Public-tier first paint | Dexie | Prerendered snapshot → `ApiLiveQuery` live |
| Service worker | Yes today (removed entirely in Phase 3) | **None** |
| Cold-start offline | Yes (bundled shell) | **No** (no SW — by design) |

### Prerender pass vs client runtime (important — avoids the "no sync" confusion)

The web build has **two passes**:

- **Prerender pass — Node, build time (`isClient === false`):** there is no browser.
  It does exactly one thing: a one-shot **public** REST fetch to populate the
  snapshot, render HTML + SEO tags, and serialize the snapshot. No sync, no socket,
  no auth, no IndexedDB, no service worker.
- **Client runtime — browser, after hydration (`isClient === true`):** this is the
  **full app**. Auth runs, the user logs in, **sync runs**, private/group data flows
  into **IndexedDB** and is read back via Dexie and layered in after mount. The only
  thing the web build lacks vs native is the **service worker**.

### What "online-only / no offline" precisely means

It refers to **cold start only**, as a *consequence* of having no service worker:

| Situation | Web | Why |
|---|---|---|
| Tab open, network drops, navigate/read synced data | ✅ works | JS in memory, IndexedDB on-device |
| Close / refresh / reopen with no network (cold start) | ❌ fails | browser must re-fetch shell HTML/JS/CSS from the network |

Only a service worker (web) or a bundled shell (native) can serve the shell for a
*cold* offline launch. We have decided against the SW, so the web cannot cold-start
offline — but the warm-tab / synced-IndexedDB case works fine (Phase 3 §3.4).

### Two rules that keep the split clean and keep Capacitor safe

1. All build-target branching lives in the **two entries + the injected source**,
   never scattered as `if (web)` checks in `.vue` files. Components stay
   source-agnostic.
2. The SPA path is the default `npm run build`; the web path is a *new* command/
   config. An SSG render failure fails the **web** build only — never the native
   path.

---

## 3. Workstreams (mapped to our files)

### WS-1 — SSG harness + shared factory *(do first)*
- Add `vite-ssg` + `@unhead/vue` to `app/package.json`; add `vite.config.web.ts` +
  `build:web` script.
- Extract `app/src/app-core.ts` (shared app construction). Add `app/src/main.web.ts`
  (ViteSSG factory). **Keep `app/src/main.ts`** as the SPA entry (refactored only to
  call `app-core`).
- Refactor `app/src/router/index.ts` to **export the `routes` array** so vite-ssg
  owns router creation (history mode stays). Audit router-singleton imports.
- In `main.web.ts`'s setup, gate all heavy runtime init (shared `init()`,
  `initSync`, socket/auth, analytics/Matomo, Sentry, splash) behind `isClient`; the
  prerender path runs only router + i18n + public-data prefetch.

### WS-2 — Public-tier data seam *(core change — NO `shared/` modification)*
- Add a **Pinia `publicContent` store** as the snapshot target (we already run
  Pinia; vite-ssg serializes Pinia `initialState` natively — most POC-faithful).
- **Build (Node):** a small standalone fetch helper in the build path does a raw
  `fetch(apiUrl + "/search", { headers: { "X-Query": JSON.stringify(query) } })`
  with **no `Authorization`** header → anonymous default/public groups → public
  content. No `shared` init, no Dexie, no socket, no `ApiLiveQuery` in Node. Query
  shape = `ApiSearchQuery` with `apiVersion: "0.0.0"`; use `slug` for the per-page
  fetch and `types`+`contentOnly` for enumeration (WS-4). This populates the
  `publicContent` store → vite-ssg serializes it into the HTML.
- **Client:** the snapshot is restored into the store before mount (vite-ssg).
  Public components read snapshot-first; for liveness they instantiate the
  **existing** `new ApiLiveQuery(query, { initialValue: <slice from the restored
  snapshot> })` — first paint matches the prerendered HTML (clean hydration), then it
  revalidates and goes live via REST+socket. `ApiLiveQuery` runs **only on the
  client** (socket is fine there), so **no `shared` change is needed**.
- *Honest tradeoff (acceptable for a scaffold):* `ApiLiveQuery` still issues **one**
  background fetch on mount even when `initialValue` is set (it does not no-op).
  Hydration is clean (the seed matches the markup), but there is one revalidation
  fetch rather than zero — and that fetch doubles as the "go live" step. Eliminating
  it would require the `shared` change we are deliberately avoiding.
- *Endpoint caveat:* `GET /search` is marked deprecated in `shared/src/rest/http.ts`
  in favour of `POST /query`, but `/query` requires a matching template validator
  (only sync-shaped `sync.ts` exists). Since the live client still uses `/search`,
  the build uses it too for parity. Revisit when the hybrid Mango query lands.
- Inject the source via `app-core` so `SingleContent.vue`, `HomePagePinned.vue`,
  `HomePageNewest`, and the Explore/Watch feeds read public content through **one
  `usePublicContent()` abstraction** (web → store/`ApiLiveQuery`, native → Dexie).
  Each declares an `onServerPrefetch` the prerenderer awaits.
- The **web** build uses *both* paths: the snapshot/`ApiLiveQuery` for the
  prerendered **public** tier (so first paint matches the prerendered HTML — Dexie is
  empty at first paint and would mismatch), and Dexie/sync for the **private** tier
  after mount.
- **Free forward-compat seam:** render feeds as `[...public, ...private]` with
  `private` empty and **stable globally-unique `:key`s** (`pub:` prefix). Enables
  the Phase 3 interleave with no rework. *Build nothing private now.* (This is a
  **DOM-key** concern — distinct from Phase 2 dependency keys; see §6.)

### WS-3 — SEO / head layer *(net-new)*
- No head library today — only manual `document.title` in `app/src/i18n.ts`
  (`initAppTitle`) and inside `SingleContent`. Add `@unhead/vue`; retire
  `initAppTitle`'s content branch.
- Per public page, derived from the content data: `<title>`, description, canonical
  (absolute), `<html lang>`, Open Graph, Twitter card, **hreflang** (from
  `ContentDto.availableTranslations`, including `x-default`), **JSON-LD `Article`**
  (the "AI SEO" goal), robots. **`dateModified` seam:** emit from the publish/update
  date now; Phase 2 overwrites with the regeneration time.
- Use **hreflang + JSON-LD `inLanguage`** for translations — *not* `sameAs`
  (schema.org `sameAs` is for the same entity across external sites).

### WS-4 — Build-time route enumeration
- `vite.config.web.ts` `includedRoutes`: query the API **unauthenticated** (no
  token → anonymous default/public groups) for **all public content slugs** + static
  routes; **exclude** client-only/private routes (`/settings`, `/bookmarks`,
  `/open`). **Fail fast if the API is unreachable** (§3.1).
- *Implementation note:* the build's REST calls must send **no** `Authorization` /
  `x-auth-provider-id` header so `resolveOrDefault` returns the anonymous identity
  with `getDefaultGroups()`. Confirm `shared`'s `getRest()` can run token-less in
  Node (it should, since anonymous is the default identity).

### WS-5 — Signed-out shell hydration *(from Phase 3 §3.2)*
- Prerendered output is the **signed-out baseline**. Auth-aware chrome
  (`app/src/App.vue`, nav, bookmarks/login state) must render its **signed-out
  state at first paint**, layering auth **after mount** (same `isClient`/post-mount
  split as WS-1). Private *data* stays Phase 3; this is purely the *shell* hydrating
  cleanly.

### WS-6 — Service worker omitted from the web build *(hard constraint)*
- `vite.config.web.ts` simply **does not include VitePWA** → the web build ships no
  service worker. The native config is unchanged. Decide the fate of the Matomo SW
  (`app/src/analytics/service-worker.js`) for the web build.

### WS-7 — Validation harness
- Enable `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__` during validation (§7) so "no
  warnings" is real proof; verify JS-off content via `curl` / view-source.

### WS-8 — Production hardening *(sequence last; §8)*
- `sitemap.xml` + `robots.txt` from the enumerated route list; configurable
  production origin for absolute URLs. Not Phase-1-blocking.

---

## 4. Risks specific to us
- **`main.web.ts` isClient split** is the riskiest mechanical work — a wrong split
  means the prerender hangs on the socket or leaks runtime concerns. Isolated to the
  web build.
- **Node-render-safety:** `App.vue` + public components must avoid
  `window`/`document`/`localStorage`/Dexie at setup-time without an `isClient`
  guard. Surfaces only on the web path; **never touches native**.
- **Two data paths can drift** (the §3.2 hazard) if the web (API) and native
  (Dexie) selectors diverge → both express the **same Mango selector**, only the
  executor differs.
- **`ApiLiveQuery` limits:** it throws on `groups` / `queryString` in the query —
  keep public queries within that.
- **Slug→slug nav reuse** (§7): `SingleContent` is already reactive on `props.slug`;
  re-verify under the new seam.

---

## 5. Acceptance criteria (how we prove it — §5)
1. One static file per public route + a real 404; no draft/unpublished content in
   any list/feed. → WS-2 / WS-4
2. Full content + all SEO tags in the raw HTML (curl / JS-off): title, description,
   canonical, OG, Twitter, hreflang, JSON-LD, body/heading/image. → WS-3 / WS-7
3. Clean hydration: no mismatch warnings, no duplicate fetch, interactive. →
   WS-1 / WS-2 / WS-5 / WS-7
4. JS-off = crawler view; private/client-only routes show nothing private. →
   WS-4 / WS-5
5. **`npm run build` (native/SPA) output is unchanged** from today. → WS-1
   build-split guard

---

## 6. Corrections to carry forward (Phase 2/3 — bank, do not build now)
From checking the mental-model diagram against the specs:
- **Don't conflate dependency keys (Phase 2) with Vue `:key` DOM keys (Phase 3).**
  Different mechanisms, different phases.
- **Private data carries *no* dependency keys** — it is excluded from the manifest
  entirely; don't "tag keys public/private."
- **Web = zero cold-start offline by design** (not "limited"); no SW anywhere.
- **Deploy repo must add edge-cache purge** after the R2 upload, and
  **delete-page removal** (not just re-render) on deletes.
- **Deploy repo calls `npm run build:web`**, not `npm run build`.

---

## 7. Decision gate (all resolved)
- **D1–D4** → *yes* (per the earlier decision table).
- **D5** → resolved (two entries + two configs; native build untouched).
- **D6** → **resolved (yes).** Unauthenticated callers receive **default group
  mappings** (`AutoGroupMappingsDto` → the static public groups) via
  `AuthIdentityService.resolveOrDefault` → `getDefaultGroups()`. `QueryService`
  applies published/expiry + permission filters, so an anonymous `getRest().search`
  / `/query` returns exactly the **published public-tier content**. The prerender
  build calls the API **with no auth token**.

  **Security bonus:** because the build is unauthenticated, it is *structurally
  incapable* of fetching private/group-scoped data — the Phase 3 "never prerender
  private data" boundary is enforced at the credential level, not by convention.
