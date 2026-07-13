# SSG/ISR — next round: CLS hardening, per-language statics, static redirects

> Implementation plan for branch `1672-app-research-and-implement-vue-ssr-for-ssgisr`.
> Status: Implemented in this branch (see "Progress" at bottom).

## Context

The SSG/ISR tier prerenders public content, hydrates via shared's response cache, and
regenerates affected pages via a polling watcher (see [README.md](./README.md)). It works
but isn't where we want it. Four improvements + a status overview:

1. **Delay notification render on web** — reduce post-hydration layout shift (CLS) for SEO.
2. **Don't render content sections while their query array is empty** — kill the
   empty-heading/empty-container flash.
3. **Per-language homepage (+ /explore, /watch)** — locale-prefixed static pages so each
   language is independently crawlable.
4. **Static HTML redirects** for `Redirect` docs — meta-refresh files so redirects work
   for crawlers / JS-off, not just the runtime SPA.

Decisions taken: locale-prefixed paths (`/`, `/es`, `/fr`); per-language for **all** public
static routes; redirects as **meta-refresh HTML files** (R2 serves them raw — `_redirects`
is a Pages-only feature and does nothing on a bare R2 bucket).

---

## 1. Delay notifications on web (CLS)

**Why:** Notifications are already SSR-guarded by `showChrome` (web: true only after
`onMounted`), so the prerendered HTML has none. But the **account banner** fires
immediately on mount for anonymous users (the crawler/first-paint case) and renders **in
main flow** (`BasePage.vue` ~L114-130) → it shoves content down right as the page settles.
Toasts are `fixed` (no CLS); banners + bottom are the culprits.

**Change — `app/src/components/BasePage.vue`:**

- Add a delayed gate alongside the existing `showChrome`:
    ```ts
    const WEB_NOTIFICATION_DELAY_MS = 3000; // ponytail: a few seconds of layout calm for CLS
    const notificationsReady = ref(!isWeb); // native: immediate; web: after the delay
    onMounted(() => {
        if (isWeb) setTimeout(() => (notificationsReady.value = true), WEB_NOTIFICATION_DELAY_MS);
    });
    ```
- Swap the three notification managers' guards from `showNotifications && showChrome` to
  `showNotifications && notificationsReady` (it implies mounted, so `showChrome` is
  redundant there). For the toast `<Teleport>`, change its `v-if="showChrome"` →
  `v-if="notificationsReady"`. Leaves all other chrome (menu/modals/audio) on `showChrome`
  unchanged.
- The store already buffers adds (100ms timer in `stores/notification.ts`); nothing else
  changes — the banners just mount ~3s later on web.

---

## 2. Gate empty content sections

**Why:** Inconsistent guards. `ContinueWatching`/`ContinueListening` already do
`v-if="...length > 0"`, but `HomePageNewest`, `HomePagePinned` rows, `PinnedTopics`,
`PinnedVideo`, and `UnpinnedTopics` (tagged) render the shared collection — which draws its
heading + scroll container even with an empty array
(`HorizontalContentTileCollection.vue` root `<div class="select-none">`, ~L96).

**Change — root-cause, one place:** add `v-if="contentDocs.length"` to the collection's
root `<div class="select-none">`. This covers every caller at once (one guard vs five
call-site guards), matching the existing ContinueWatching pattern. The category grouper
(`components/contentByTag.ts`) already drops empty tags, so pinned rows only exist with
content. **Confirmed:** `HorizontalContentTileCollection` is the _only_ tile-collection
component (explore/video grids use it via the `useVerticalTileLayout` prop), so no vertical
variant to also guard.

**Note on SSG:** prerendered HTML already has data (onServerPrefetch fills it) and the
response-cache seed feeds the first client render — so this guard's real job is suppressing
the live-query catch-up flash for any section whose seed was empty/absent.

---

## 3. Per-language static pages (locale-prefixed)

**Target URLs:** default language stays unprefixed (`/`, `/explore`, `/watch` = canonical);
each non-default language code `c` gets static paths `/${c}`, `/${c}/explore`,
`/${c}/watch`. Output files: `dist-web/es.html`, `dist-web/es/explore.html`, etc.

**Routing collision is a non-issue:** Vue Router ranks **static** segments above dynamic
params, so a static `/es` outranks `/:slug` regardless of registration order. We register
explicit static routes per language code (not a `:lang` param), so there's no ambiguity
with content slugs.

**Changes:**

- **New `app/src/router/localizedRoutes.ts`** — pure helper
  `localizedStaticRoutes(langCodes: string[], defaultCode: string): RouteRecordRaw[]`
  returning the `/${c}`, `/${c}/explore`, `/${c}/watch` records (component = HomePage /
  ExplorePage / VideoPage, `meta.prerender`, `meta.lang = c`). Skips `defaultCode`.
- **`app/src/main.web.ts`** (the web entry only — native stays UI-only):
    - Destructure `router` from the ViteSSG setup context and `router.addRoute(...)` each
      localized route. The setup fn already fetches `ssgLanguages` and is awaited by vite-ssg
      **before** `router.push(routePath)` (SSR) / `router.isReady()` (client), so the routes
      exist when `/es` resolves. On the client, build them from `initialState.languages`.
    - Extend `ssrRouteLang(routePath)`: if the leading path segment is a known language code,
      return that language's id; else the existing content-slug map; else default. Add a
      `code→id` lookup (from the fetched languages) and serialize it via `initialState`.
- **`app/vite.config.web.ts`**:
    - `fetchDefaultLanguage` already fetches languages — extend to capture
      `{ _id, languageCode, default }` for all, expose `__SSG_LANG_CODE_TO_ID__` + default
      code on `globalThis` (consumed by `ssrRouteLang`).
    - In `includedRoutes`, for each non-default language code, add localized variants of the
      three `meta.prerender` static routes to the enumeration (full build only; scoped builds
      already pass explicit `SSG_ONLY_ROUTES`). Existing `prerenderedRoutes` → sitemap picks
      them up automatically.
- **hreflang:** add `useHead` alternates on the three static pages (or a shared
  `useLocalizedStaticHead(routeBase)` composable) emitting
  `<link rel="alternate" hreflang="<code>" href="/<code><base>">` for every language +
  `hreflang="x-default"` → the unprefixed path. Mirror the per-translation hreflang pattern
  already in `pages/SingleContent/SingleContent.vue`.
- **ISR:** localized pages run the same `useContentQuery` seam → facet keys are already
  language-scoped, so the manifest + watcher regenerate per-language pages correctly with
  zero watcher change.

**Scope boundary:** in-app language switching keeps its current localStorage behavior (does
not rewrite the URL). Localized URLs are entry/crawl points; URL-syncing the language
switcher is a possible follow-up, not this pass.

---

## 4. Static HTML redirects (meta-refresh)

`RedirectDto` = `{ slug, toSlug?, redirectType }` (`shared/src/types/dto.ts`). Runtime SPA
already resolves them (`pages/SingleContent/SingleContent.vue` `routeRedirect` + the
not-found `queryRemote` probe). We add a **static** layer for crawlers / JS-off.

- **New `app/src/ssg/redirectHtml.ts`** (pure, shared by build + watcher — no Vue/DOM):
    ```ts
    export function redirectHtml(toSlug: string): string; // <meta http-equiv=refresh 0;url=/toSlug>
    // + <link rel=canonical> + <script>location.replace</script>
    export const redirectFile = (slug: string) => `${slug}.html`;
    ```
    (`<` in the target is escaped; canonical reinforces permanent redirects for SEO — note
    meta-refresh is browser/crawler-level, not a true HTTP 301; documented limitation.)
- **`app/vite.config.web.ts`** — add `fetchRedirects(apiUrl)` (anonymous `/search` with
  `types:["redirect"]`, `contentOnly:false`). In `onFinished` on a **full** build, write
  `dist-web/<slug>.html` per redirect, **skipping** any slug that already has a prerendered
  content file (content wins; server enforces mutual exclusivity anyway).
- **`app/src/ssg/watch.ts`** — include `DocType.Redirect` in the existing `lastSeen` poll.
  On a changed redirect, **write** its meta-refresh file directly (no vite-ssg build needed
  — it's one fs write); on a deleted redirect (`deleteReq`/tombstone), **remove** the file.
  Cheap, decoupled from the page rebuild path. Reuse `redirectHtml.ts`.

---

## 5. Overview — where SSG/ISR stands

**Done & working:** prerender of content + `/explore` + `/watch`; no-flash hydration via
shared's response cache; i18n SSR; lang-scoped facet-key manifest; scoped `build:affected`;
polling ISR watcher (verified end-to-end on staging); recategorization old-facet coverage
via `ssg-doc-facets.json`; OOM root-caused (seed 105KB→39KB).

**This pass adds:** CLS delay (1), empty-section gating (2), per-language statics (3),
static redirects (4), and app-side content DeleteCmd handling.

**Still open after this pass:**

- **Full `build:web` to completion** across all ~1934 routes on a production-sized dataset
  (the OOM fix's final confirmation) — user-run.
- **CDN cache-eviction hook** (Cloudflare/Wrangler) — lives in the deploy repo.
- **Browser QA** (user-owned): `preview:web` in Incognito — no flash, no hydration warnings,
  language switch, 404, nav links, and now the localized URLs + redirect files.

---

## Verification

- `cd app && npm run type-check` — whole-app types green.
- `cd app && npm run build:web` against an API with ≥2 languages and ≥1 redirect doc, then:
    - `ls dist-web/es.html dist-web/es/explore.html dist-web/es/watch.html` exist; each
      contains the language's content + `hreflang` alternates.
    - `grep -l 'hreflang="x-default"' dist-web/index.html` present.
    - `cat dist-web/<redirect-slug>.html` shows the meta-refresh + canonical to `/<toSlug>`.
    - `dist-web/sitemap.xml` includes the localized routes.
- `cd app && npm run preview:web` (Incognito): home renders; manually hitting `/es` shows the
  Spanish home (clean hydration, no 404 flash); a redirect slug bounces to its target with
  JS on AND with JS disabled; content sections don't flash empty headings; banners appear
  only after ~3s.
- ISR: with `watch:ssg` running, edit a redirect doc → its `dist-web/*.html` updates within a
  poll cycle; edit content in a non-default language → only that language's pages regenerate.
- E2E/Playwright and any build against deployments are **user-run** (per repo conventions).

## Files

New: `app/src/router/localizedRoutes.ts`, `app/src/ssg/redirectHtml.ts`.
Edited: `app/src/components/BasePage.vue`,
`app/src/components/content/HorizontalContentTileCollection.vue`, `app/src/main.web.ts`,
`app/vite.config.web.ts`, `app/src/ssg/watch.ts`, the three static pages
(`HomePage.vue`/`ExplorePage.vue`/`VideoPage.vue`) for hreflang, and `app/src/ssg/README.md`.

---

## Progress

- **Feature 1 (notifications delay):** complete. `BasePage.vue` delays all notification
  managers behind `notificationsReady` on web.
- **Feature 2 (empty sections):** complete. `HorizontalContentTileCollection` renders no
  wrapper when `contentDocs` is empty.
- **Feature 3 (per-language statics):** complete. The web entry registers localized routes,
  the build enumerates them, and the static pages emit hreflang alternates.
- **Feature 4 (static redirects):** complete. Full builds write meta-refresh files and the
  watcher writes/removes them on redirect changes.
- **Local ISR cleanup:** complete in app repo. The watcher prunes stale content/redirect
  files and manifest/index entries before rewriting redirects or rebuilding affected pages.
