# SSG Review Findings — updated 2026-07-13

Re-verified against the working tree. Header per item: **DONE** / **OPEN**.

## 1. `src/ssg/` is four programs in one folder — **mostly DONE**

The Node-only runtime is gone from `app/`. Deleted this round: `watch.ts`, `watchPoll.ts`,
`watchPoll.spec.ts`, `ssgNodeEnv.ts`, `verifyIsolation.ts`, `whatChanged.ts`,
`computeAffected.ts`, and the `watch:ssg` script. They now live in the deploy repo, which is
where the topology said they belonged.

`src/ssg/` is down to two runtimes, both safe to have under `@/`:

| Runtime | Files |
|---|---|
| App bundle (browser + Node render) | `clientRuntime.ts`, `dependencyCapture.ts`, `polyfills.ts` |
| Pure build-time domain logic | `facetKeys.ts`, `routeIndex.ts`, `redirectIndex.ts`, `redirectHtml.ts` (+ specs) |

**Still open, but now low stakes:** the pure build-time modules are still `@/`-importable from
`src/`, rather than sitting in `vite-plugins/ssg/`. Nothing Node-only remains to accidentally
import into a component, so this is tidiness, not a hazard. Do it if/when the deploy repo needs
to import `facetKeys`/`routeIndex` directly.

The web build path is untouched: `build:web` → `vite-ssg build --config vite.config.web.ts` →
`main.web.ts` + the retained render helpers.

## 2. `vite.config.web.ts` is doing app domain work — **OPEN, unchanged (480 lines)**

Still contains three API fetchers, sitemap/robots generation, response-cache serialization, the
inline auth-gate script, HTML string surgery, and a build lock. Same split as before:
`vite-plugins/ssg/enumerate.ts` (fetchers + route index + facets), `vite-plugins/ssg/seo.ts`
(sitemap/robots), `vite-plugins/ssg/hydrationScripts.ts` (hqcache + auth gate) → config lands
around 120 lines.

## 3. The `globalThis` channel — **OPEN, unchanged**

Four undeclared, untyped globals across three files:

```
__SSG_DEPS__            vite.config.web.ts:24-27  ⇄  src/ssg/dependencyCapture.ts:18
__SSG_ROUTE_LANG__      vite.config.web.ts:299    →  src/main.web.ts:31
__SSG_DEFAULT_LANG__    vite.config.web.ts:393    →  src/main.web.ts:32
__SSG_LANG_CODE_TO_ID__ vite.config.web.ts:395    →  src/main.web.ts:30
```

`vite.config.web.ts:17-28` still re-declares `SsgCapture` inline because it can't import it. One
`src/ssg/ssgGlobals.ts` with typed `getSsgContext()`/`setSsgContext()` still kills it, and falls
out of §2 for free.

## 4. Concrete simplifications — 6 of 6 done

| # | What | Status |
|---|---|---|
| 1 | `verifyIsolation.ts` + `whatChanged.ts` — dead CLIs | **DONE** — deleted (−155) |
| 3 | `makeStorage()` defined twice | **DONE** — `ssgNodeEnv.ts` left with the watcher; only `ssg/polyfills.ts:20` remains |
| 2 | 4× hand-rolled hydration gate | **DONE** — `useHydrated()` owns the native-immediate / web-after-mount policy. App chrome, BasePage notifications, TopBar profile, and DesktopSidebar overlays now use it. |
| 4 | `build:web` / `build:affected` byte-identical | **DONE** — removed `build:affected`; scoped deploys use `SSG_ONLY_ROUTES=… npm run build:web`, documented in the app SSG README and app instructions. |
| 5 | `articleHead.ts` + `useLocalizedStaticHead.ts` + inline `useHead` in SingleContent | **DONE** — `src/seo/contentHead.ts` owns static and article web heads; the old two modules and inline head are gone. |
| 6 | `SingleContent.vue` — **still 1053 lines**, ~10 watchers on `content` | **DONE** — reduced to 843 lines. `useTranslationSwitcher()` owns forced language selection, preference redirects, URL replacement, and the translation banner. |

## 5. SEO / AI-citation gaps — **ALL OPEN, nothing landed**

Re-grepped: still **zero** `og:image`, `lastmod`, `og:site_name`, `Organization`,
`BreadcrumbList`, `WebSite`, `llms.txt`. `SingleContent.vue:374-377` has `og:type`/`title`/
`description`/`url` and nothing else.

**Bleeding, fix first:**

1. **`/`, `/explore`, `/watch` still have no `<title>` and no description.**
   `useLocalizedStaticHead.ts` emits only `htmlAttrs.lang` + canonical + hreflang (verified —
   no `title`, no `meta`). Their prerendered title is whatever `index.html` says: **"Loading..."**.
   Still the single worst thing in the branch.
2. **No `og:image` / `twitter:image` anywhere.** Derivable at prerender from
   `content.parentImageData` + `useBucketInfo`.
3. **Sitemap has no `<lastmod>`.** `vite.config.web.ts:174-177` writes bare `<url><loc>` entries.
   You have `updatedTimeUtc` on every doc and an ISR pipeline whose whole point is freshness.
   Two lines.

**JSON-LD still thin** (`articleHead.ts` — headline/description/author/dates/inLanguage). Missing
the fields AI answers actually quote: `publisher` (Organization + logo), `image` (required for
Google Article rich results — currently ineligible), `mainEntityOfPage`, `wordCount` (already on
`content`), `articleSection` from `categoryTags`, `BreadcrumbList` from the tag hierarchy,
`WebSite` + `SearchAction` on `/` (you have FTS — sitelinks searchbox is free).

**AI-crawler specifics:** `llms.txt` emitted alongside robots/sitemap; explicit
`GPTBot`/`ClaudeBot`/`PerplexityBot`/`Google-Extended` allow blocks in robots.txt;
`og:site_name` + `og:locale` + `og:locale:alternate`.

## 6. Two bugs — **BOTH OPEN**

**A. Pre-paint auth gate can strand logged-in users on a blank page.**
`vite.config.web.ts:88-103` adds `.ssg-auth-pending` (→ `visibility:hidden` on `#app`) for anyone
with an Auth0 localStorage key. Still removed **only** by `App.vue:131`'s `onMounted`. If the ES
module 404s, throws, or `initWebClient()` hangs, a returning logged-in user gets a permanently
white page with valid prerendered HTML invisible underneath.

Failsafe belongs in the inline script, not in Vue:
`setTimeout(function(){document.documentElement.classList.remove("ssg-auth-pending")},3000)`

**B. The 404 page is marked indexable — DONE.** `useContentHead()` now emits
`noindex,follow` when no document resolves.

---

**Remaining order:** (1) static-page titles + og:image + sitemap lastmod. (2) the auth-gate
failsafe. (3) split `vite.config.web.ts` — §3 typing falls out free.
