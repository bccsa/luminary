# Conversation: Migrate search modal to a dedicated `/search` page

> Branch goal: implement fully fledged SSG support. This is one review item, worked step by step.

## User request

> "To avoid json-ld 'search trickery', migrate the search modal to a full-blown search page. This page is used on mobile when selecting the search button from the bottom menu. On desktop we still use the search modal, but use the same component as embedded on the dedicated search page. when a user would add /search to the URL, it will open the dedicated search page on desktop or mobile, but on Desktop we do not have a visible route to the page, as the modal suffices."
>
> We are currently making search actions via "/explore" - these should be done with a new search route. The desktop mode will also have a search page, but it won't be navigated to, the modal will still be the thing being used, but a user could route to it themselves. On mobile it should route, and the current mobile search modal should become the search page basically.
>
> Referenced files: `app/src/components/navigation/SearchModal.vue`, `app/src/router/index.ts`, `app/src/seo/json-ld.md`

## Exploration

Read the relevant files to understand the current setup:

- `app/src/router/index.ts`, `app/src/router/routes.ts`, `app/src/router/localizedRoutes.ts`
- `app/src/components/navigation/SearchModal.vue` (928 lines — full search UI + logic + overlay)
- `app/src/composables/useSearchOverlay.ts` (global overlay state)
- `app/src/components/navigation/MobileMenu.vue`, `navigationItems.ts`, `DesktopSidebar.vue`, `TopBar.vue`
- `app/src/components/HomePage/HomePageSearch.vue`
- `app/src/pages/ExplorePage.vue` (topics browsing — `/explore` is NOT search)
- `app/src/seo/publicSite.ts` (`websiteJsonLd` SearchAction → `/explore?q={search_term_string}`)
- `app/src/seo/contentHead.ts` (`useLocalizedStaticHead`, `staticPageCopy`)
- `app/src/seo/json-ld.md`
- `api/src/db/seedingDocs/lang-eng.json` (i18n seed: `title.search` exists; `search.*` keys present)
- `app/src/components/BasePage.vue`, `IgnorePagePadding.vue` (layout / scroll container)
- `app/src/components/navigation/SearchModal.spec.ts`, `router.spec.ts`, `localizedRoutes.spec.ts`
- `vite.config.web.ts` (prerender enumeration via `meta.prerender`)

### Key findings

- `/explore` is the topics page (`PinnedTopics`/`UnpinnedTopics`); `SearchModal` watches `route.query.q` when `route.path.endsWith("/explore")` — the "search trickery".
- `SearchModal` is mounted globally in `App.vue` (gated by `showChrome`), controlled by `useSearchOverlay`.
- Mobile menu + desktop sidebar + home search button all call `openSearch()`.
- `BasePage`'s `<main class="flex-1 overflow-y-scroll px-2 py-2 scrollbar-hide">` is the real page scroll container (not `window`/`document`).

## Plan (approved)

Extract the search UI/logic out of `SearchModal.vue` into a shared `SearchPanel.vue`, used by both a new `SearchPage.vue` (route) and a slimmed `SearchModal.vue` (desktop overlay). Mirror the `/explore` route pattern for `/search`, and repoint the JSON-LD `SearchAction` at `/search`.

- **Mobile** (`< lg`): bottom-menu search button **navigates** to `/search`.
- **Desktop** (`≥ lg`): keeps the **modal** (Cmd+K too) embedding the same `SearchPanel`; no nav link to `/search`, but the URL works if typed/crawled.
- `/explore` stops being involved in search.

Plan file: `/Users/dirk/.claude/plans/compressed-moseying-blossom.md`

## Implementation

### 1. `app/src/components/search/SearchPanel.vue` (new)
Moved the search core out of `SearchModal.vue`: `searchQuery`, recent-searches persistence, `useFtsSearch`, result enrichment/highlighting, keyboard nav, infinite scroll, template (input header row + results/states/recent list).

- Prop `mode: "modal" | "page"` (default `"modal"`).
- `defineExpose({ focus, clear })`.
- **page mode**: reads `q` from `route.query` on mount + watches it; after a search runs, writes `q` back via `router.replace({ query: { q } })` (replace, no history spam; drops the param when cleared); Escape clears the query; no close button.
- **modal mode**: internal state; close button emits via shared overlay `closeSearch()`; keeps existing mobile focus/blur behaviour; no route interaction.
- Arrow-key containment (capture-phase document listener) registered only in modal mode so arrows don't scroll the page behind the overlay; page mode lets arrows scroll normally.
- Infinite scroll target is mode-aware: modal → internal results container; page → `BasePage`'s `<main>` (via inject `appMainScrollEl`).

### 2. `app/src/pages/SearchPage.vue` (new)
`<BasePage><IgnorePagePadding ignoreTop><SearchPanel mode="page" /></IgnorePagePadding></BasePage>`; calls `useLocalizedStaticHead("/search")`; `markPageReady()` on mount.

### 3. Routes
- `routes.ts`: `/search` (name `search`, `SearchPage`, `meta: { title: "title.search", prerender: true }`).
- `localizedRoutes.ts`: `/${code}/search` (name `search-${code}`). Picked up automatically by `main.web.ts` and `vite.config.web.ts`'s `meta.prerender` enumeration.

### 4. `SearchModal.vue` → thin desktop overlay
Keeps the `<Transition>` backdrop, global Cmd+K / Escape listeners. Embeds `<SearchPanel mode="modal" />`. Removed the `/explore?q` watcher.

### 5. Mobile entry → route, desktop entry → modal
- `MobileMenu.vue`: search tab `router.push({ name: "search" })`; active state `route.name === "search" || name.startsWith("search-")`.
- `HomePageSearch.vue`: mobile navigates to `/search`, desktop keeps `openSearch()`.
- `DesktopSidebar.vue`: unchanged (`openSearch()`).

### 6. SEO / JSON-LD
- `publicSite.ts`: `SearchAction.target` → `/search?q={search_term_string}`.
- `contentHead.ts`: `staticPageCopy["/search"]` + `useLocalizedStaticHead` basePath union widened.
- `lang-eng.json`: added `search.title` / `search.description`.
- `BasePage.vue`: `provide("appMainScrollEl", main)`.

### 7. Doc
`json-ld.md`: replaced `/explore?q` example with `/search?q`; noted `/explore` is no longer a search endpoint.

### 8. Tests
- `router.spec.ts`: count 8 → 9, added `/search` config assertion.
- `localizedRoutes.spec.ts`: added `/es/search`, `/fr/search`.
- `SearchModal.spec.ts`: removed the obsolete `/explore?q` test (now in SearchPanel spec).
- `SearchPanel.spec.ts` (new): `/search?q=` populates + runs; no-`q` no-ops; URL write-back on search; `q` dropped on clear; no close button; Escape clears.

## Verification

- `npm run type-check`: clean for all touched files. 11 remaining errors are **pre-existing** in `src/sync.spec.ts` (`DocType.DefaultAffinity` enum drift) — untouched, unrelated to search.
- Full unit suite: **85 files / 697 passed, 1 skipped**.
- ESLint + Prettier clean on all changed files.
- One page-mode test initially failed ("drops the q param when the query is cleared") because the mocked `router.replace` doesn't mutate `route.query`, so the clear-path equality guard skipped. Fixed by simulating the URL having updated (`routeMock.query = { q: "willowdale" }`) before clearing.

### Still to verify (user side, requires live API / E2E owned by user)
- `npm run dev` / `npm run dev:web`: mobile bottom-menu search → `/search` (types + Go updates URL); desktop Cmd+K/sidebar opens modal; `/search` and `/search?q=term` render with correct head/JSON-LD.
- `npm run build:web`: `/search` prerendered and in `sitemap.xml`; `WebSite.potentialAction.target` reads `…/search?q={search_term_string}`.

## Commit

`1a36cbe2` on branch `1672-app-research-and-implement-vue-ssr-for-ssgisr`:

```
feat(app): add dedicated /search page, migrate search modal off /explore

The JSON-LD SearchAction pointed at /explore?q=..., reusing the topics-browsing
page URL as the public search endpoint ("search trickery"). Add a real,
prerenderable /search page and repoint the SearchAction at it.

Extract the search UI/logic from SearchModal into a shared SearchPanel
(mode="modal" | mode="page"), embedded by both the desktop modal overlay and
the new SearchPage route. Mobile bottom-menu search now routes to /search
instead of opening the overlay; desktop keeps the modal (Cmd+K/sidebar) with
no visible nav link to the page. Page mode syncs q to the URL via
router.replace so the page is shareable and back/forward works.

- Add /search (+ /:code/search) prerender routes mirroring /explore
- publicSite.ts SearchAction target -> /search?q={search_term_string}
- contentHead.ts + lang-eng.json: search.title/search.description for the page head
- BasePage provides its scrolling <main> so page-mode results infinite-scroll
  off the real page scroller
- /explore is no longer involved in search in any form
```

16 files changed, +1299/−926. Unrelated `ssg-standup.html` left untracked.