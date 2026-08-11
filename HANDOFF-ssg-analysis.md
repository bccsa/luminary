# SSG/SSR investigation — handoff

Branch: `1672-app-research-and-implement-vue-ssr-for-ssgisr`
Two commits pushed: `6028dd02`, `87c3aa9c` (both on top of `b0f9c22d`).

---

## 1. Committed & done

### `6028dd02` — related content missing from prerendered HTML (FIXED)

**Symptom.** Article pages rendered without category chips and without the entire
"Read more" section.

**Root cause.** `app/src/ssg/contentStore.ts` `queryContentLocal` returns `[]` when the
build corpus is present but nothing matches. `[]` is truthy, so `resolveQuery` in
`app/src/composables/useContentQuery.ts` treated it as authoritative and never fell back
to the API. SingleContent's `tags` query hit that path; because the RelatedContent
wrapper is gated on `v-if="content && tags.length"` (`SingleContent.vue:909`), its
children never mounted, so links 4 and 5 of the query chain never even registered a
prefetch.

**Fix.** An empty local result now falls back to `queryRemote`. Verified in the emitted
HTML — `dist-web/*.html` now contains `<section class="w-full pb-2"><h2>Read More</h2>`
with real `<li><a href="/...">` cards.

Also in this commit (hardening, because three separate paths let the failure stay silent):

- `app/src/ssg/ssrChains.ts` — `queueOnChain` stored the caller's promise as the chain
  tail, so one rejected query meant `.then(run)` never invoked `run` for every later
  query on that route. Tail now swallows rejections; the caller still awaits its own.
- `app/src/ssg/renderDiagnostics.ts` (new) — collects `RenderIssue`s during prerender via
  a `globalThis.__SSG_RENDER_ISSUES__` bridge, same pattern as `dependencyCapture.ts`.
  `useContentQuery` reports both rejections and provably-empty selectors.
  `vite.config.web.ts` drains them: a `query-failed` issue fails the build (`SSG_STRICT=0`
  downgrades to a warning); `provably-empty` issues are deduplicated warnings only.
  **Note:** the original plan asserted a provably-empty selector is always a bug. That is
  empirically false — a real build produced 62, essentially all legitimate (`{"_id":{"$in":[]}}`
  on `/` is a personalised feed with no user state during prerender; `{"parentId":{"$in":[]}}`
  on tag routes is a tag with no tagged documents). Hence warnings, not failures.
- `app/src/ssg/queryDrain.ts` — `drainQuery` ended on the first short page, so a
  server-side cap or partial page silently truncated the corpus. It now probes past a
  short page and throws if more documents exist.
- `app/src/pages/SingleContent/__tests__/SingleContent.ssr.spec.ts` (new) — first
  `renderToString` test in `app/src`. Nothing exercised the server renderer before, which
  is why the regression shipped.

**Why `@vue/server-renderer` hid all of this:** `server-renderer.cjs.js:682` ends the
prefetch chain with `.catch(shared.NOOP)` and renders the subtree anyway. A failed
prefetch leaves an empty ref and produces HTML with sections missing, with no warning and
no non-zero exit.

### `87c3aa9c` — 404 flash on hydration (FIXED, root cause in `shared/`)

**Symptom.** Hydrating an article flashed NotFoundPage ("You are not logged in",
`notfoundpage.unauthenticated.title`) for ~1s.

**Root cause.** `shared/src/util/HybridQuery/HybridQuery.ts` `_run()` seeds first paint
from the response cache into `_local` (a server-written seed is `{local: docs, remote: []}`,
so the whole window is in `_local`). The authoritative Dexie read then lands; on a cold
start it is empty, and `_setLocal([])` replaced the seeded local **wholesale**, publishing
an empty `output` while the API supplement was still in flight. `SingleContent`'s
`isLoading` is only ever lowered, never re-raised, so `is404` (`!isLoading && !content`)
became true. `_recompute` then persisted that empty window over the good seed, so the
next mount started from a seed miss — which is why it looked intermittent.

**Fix.** A generation that painted from a seed is marked (`_seededLocal`); while the
remote leg is pending, an empty local read retains the seeded window. A non-empty read
still replaces wholesale (deletions keep propagating). `_recompute` no longer writes an
empty window while unsettled. The API-supplement decision moved ahead of `_setLocal` so
the guard can see whether a remote leg is owed.

A defect was caught and fixed in review: `_settleRemote` initially dropped the seed
unconditionally, but two paths reach it without the server answering — the offline park
(`HybridQuery.ts:840`) and total POST failure (`:908`, whose own comment says "keep the
current `_remote` (and its seed) and heal later"). Gated on `_remoteAnswered`, set in
`_setRemote`, so only a real server answer retires the seed.

`SingleContent`'s `is404` additionally treats an unsettled query (`isContentFetching`) as
"not resolved yet" rather than "not found".

### Verification at time of push

- app suite: 103 files, 817 passed, 1 skipped — exit 0
- shared suite: 1285 passed, 1 failed
- `npm run type-check`: clean. `npm run lint`: 0 errors, 2 pre-existing warnings.

The single shared failure is `responseCache.spec.ts > "drops any stale entry for the key
when the write overflows quota"`. **Pre-existing** — confirmed by stashing our changes and
re-running; neither `responseCache.ts` nor its spec was touched.

---

## 2. OPEN — article body disappears after JS loads

**This is the top priority. Root cause is identified; the fix is not written.**

**Symptom.** The prerendered HTML contains the full article body. Once the JS boots, the
body vanishes. Header, image, summary, byline, reading time and the Read More section all
still render.

**Root cause: the web tier never hydrates.**

`app/node_modules/vite-ssg/dist/index.mjs`:

```js
const app = client ? createApp(App) : createSSRApp(App);   // line 16 — client branch uses createApp
...
const { app, router } = await createApp$1(true);
app.mount(rootContainer, true);                            // line 79
```

Vue's runtime-dom `createApp().mount()` wrapper accepts **one** argument, so that `true`
is ignored, and its first act is `container.innerHTML = ''`. Only `createSSRApp` enables
the hydration path. The browser therefore discards the prerendered DOM and renders from
scratch.

That invalidates the text-recovery design. `SingleContent.vue:141-146` runs in `setup()`,
which executes *after* the container was emptied, so
`document.querySelector('[data-ssr-article-text]')` returns `null`,
`recoverSsrArticleText` (`app/src/util/ssrTextRecovery.ts`) bails, `contentOverride` is
never set, and `content` falls through to the seed doc — which deliberately carries no
`text` (`ssrCacheStripFields: ["text","fts","ftsTokenCount","_rev"]`). `v-if="content.text"`
(`SingleContent.vue:885`) then removes the whole prose block.

**Introduced by `5d3a40a5`** ("perf(app): recover SingleContent's article text from the
DOM instead of duplicating it in the SSR cache seed"). Before it the seed carried `text`
and this worked. Not caused by `6028dd02`/`87c3aa9c`.

**Evidence gathered (do not redo):**

- `dist-web/a-new-year-in-gods-hand.html` contains `data-ssr-article-text="true"`, the
  `prose prose-zinc` div, and the body heading — the prerender output is correct.
- Decoding the inlined seeds from that file gives three entries:
  - `hqcache:1ra4t4r` — content: `local=1`, slug `a-new-year-in-gods-hand`, `HAS_text=False`,
    `wordCount=712`
  - `hqcache:1wy957k` — translations, leading with the Swahili sibling
  - `hqcache:16859hf` — tags, `local=3`
- The seed **hits** (header renders, and 712 words / 4 min ≈ 178 wpm matches the screenshot),
  so this is not a seed miss and not an auth-scope (`:auth` vs `:anon`) key mismatch.
- The translation-switcher theory is **ruled out**: `useTranslationSwitcher` does assign
  `contentOverride` from the text-stripped translations list (lines 48, 69, 104), but the
  hydrated page shows the same `wordCount`, so `content` is still this article.
- No hydration-mismatch warnings appear in the console — consistent with no hydration
  being attempted at all.

**Fix options:**

1. **Snapshot before mount** (keeps the payload win). In `app/src/main.web.ts`, read
   `[data-ssr-article-text]`'s `innerHTML` at module scope — before `app.mount` wipes it —
   stash it (e.g. on `globalThis`), and have `recoverSsrArticleText` consume that snapshot
   instead of querying live DOM. Update `app/src/util/ssrTextRecovery.spec.ts`.
2. **Stop stripping `text` from the SSR seed** — drop `"text"` from `ssrCacheStripFields`
   in `SingleContent.vue`. Simplest and immediately correct; ships the body twice per page
   (~2x the largest field on the heaviest pages).

**The deeper issue:** not hydrating forfeits the SSG benefit entirely, forces a full client
re-render on every page, and is plausibly the same root cause behind the original 404
flash. Fixing it properly means getting vite-ssg to use `createSSRApp` on the client
(upstream change, patch-package, or a custom client entry). Larger than either option
above but worth scoping.

---

## 3. OPEN — `build:web` exits 1 on a successful build

A full build completes and writes every artifact, then:

```
[vite-ssg] Build process still running after 15s. There might be something misconfigured
in your setup. Force exit.
```

…and exits 1. Nothing throws; Node's event loop is held open by un-`unref`'d timers in
`shared/src/util/MangoQuery/queryCache.ts` (lines 46, 68, 249 — `scheduleTemplatePersist`
plus the cache-TTL timers). They are guarded by `hasLocalStorage()`, which is **true**
during the build because `app/src/ssg/polyfills.ts` shims `localStorage`.

`mangoCompile` only entered the build path with `b0f9c22d` (the corpus resolver), so this
pre-dates our work. **It matters a lot:** the deploy repo would treat every build as
failed and never upload, and it makes the new fail-loud exit-code contract meaningless.
Fix: `.unref()` those timers under Node.

---

## 4. OPEN — prerender computes a wrong reading time

The prerendered page shows **356 min** for a 712-word article; the client shows 4 min.
712 / 356 ≈ 2 wpm, so `averageReadingSpeed` resolves to ~2 during prerender and ~178 on
the client. Look at the `contentLanguage` → `averageReadingSpeed` chain in
`SingleContent.vue` (`languages` derives from `availableTranslations` + `cmsLanguages`)
and `app/src/util/readingTime.ts` `resolveReadingSpeedWpm`. Independent of the text bug.

---

## 5. Deployment / ISR repo implications

**Must change:**

- **Retry policy.** Two new legitimate non-zero exits exist: a `query-failed` render issue,
  and `drainQuery` detecting a truncated corpus. Per ADR 0018 the deploy repo runs scoped
  `SSG_ONLY_ROUTES=… npm run build:web` off a poll cursor — it must **not advance the
  cursor on a non-zero exit, and must retry**. Otherwise a transient API error leaves a
  route permanently stale (previously the same hiccup uploaded a page with a missing
  section, which self-healed on the next content change).
- **`SSG_STRICT`** is a new optional env var; `SSG_STRICT=0` downgrades the throw to a
  warning. Reasonable for scoped ISR rebuilds where staleness is worse than a partial
  page; leave full builds strict.
- Section 3 above must be fixed first, or exit codes carry no signal at all.

**No change needed:** every artifact format is unchanged — `ssg-deps.json`,
`ssg-route-index/`, `ssg-doc-facets/`, `ssg-delete-queue/`, static redirects,
sitemap/robots/llms. The three pure modules the deploy repo mirrors — `facetKeys.ts`,
`docFacetShards.ts`, `routeIndexShards.ts` — are untouched, so those copies stay in sync.
`SSG_ONLY_ROUTES` / `SSG_DELETE_CMD_IDS` semantics unchanged, as is the inlined `hqcache:`
seed format.

**Worth knowing:** builds now issue slightly more API calls — `resolveQuery` falls back to
`queryRemote` on an empty corpus result, and `drainQuery` adds one probe per drain.

---

## 6. Ruled out — do not re-investigate

- **`mangoCompile` operator support.** `shared/src/util/MangoQuery/compileTemplateSelector.ts`
  correctly implements every operator `mangoIsPublished` uses: `$not`, `$elemMatch`,
  `$exists`, `$in`, `$lte`, `$gte`, `$or`, `$and`, bare equality. `{expiryDate: null}` not
  matching an absent field differs from CouchDB but is compensated by the sibling
  `{expiryDate: {$exists: false}}` clause in the same `$or`.
- **Corpus missing tag-parented content.** It is present. `api/src/endpoints/query.service.ts`
  injects a Post branch **and** a Tag branch `$or` for a `type: content` query with no
  `parentType`; `queryDrain.ts` applies no `fields` projection and no `parentType` clause.
  `dist-web/ssg-doc-facets/05.json` shows `parentTags: ["tag-category1","tag-topicA"]`, and
  the sitemap carries 1961 URLs including topic/category pages.
- **`d94b1088`** (dropped `publishDate` sorts) cannot empty a result — it only changes
  index hints and ordering, and the local corpus path ignores `use_index` entirely.
- **SSR chain depth.** Not limited. Vue's renderer awaits each component's `sp` before
  rendering its subtree, so arbitrarily deep parent→child chains resolve. The 5-link chain
  (content → translations → tags → RelatedContent.contentDocs → ReadMore.tagDocs) works.
- **Empty display language** as the cause of the empty `tags` query. Plausible on paper —
  `useContentQuery.ts:224` turns an empty `displayLanguageIds()` into
  `{language: {$in: []}}` — but the real build showed no provably-empty issues on article
  routes, and the actual cause was the corpus fallback (section 1).
- **Auth-scope cache-key mismatch** (`:auth` vs `:anon`) as the cause of the missing text.
  The seed hits; see section 2 evidence.

---

## 7. Useful commands

```sh
cd app
npx vitest run src/ssg src/composables src/pages/SingleContent   # NB: `npm run test` is watch mode
npm run type-check
npm run lint
SSG_ONLY_ROUTES=/a-new-year-in-gods-hand npm run build:web       # scoped rebuild, one route
SSG_DISABLE_LOCAL_CONTENT_STORE=1 npm run build:web              # bypass the build corpus
```

Do **not** run Playwright / E2E — those are owned by the user.

This worktree's ports (`.worktree-ports.env`): api 3030, app 4204, cms 4205. `api/.env`
already allows 4204/4205/4174 in `CORS_ORIGIN`. Note `localhost:4174` may be served by a
*different* checkout (`/Users/dirk/Work_Projects/luminary/app`) — check
`lsof -nP -iTCP:4174 -sTCP:LISTEN` before concluding anything from what it renders.

Untracked files at repo root (`todos.md`, `dev-*.sh`, `_potential_performance_increases`,
`.worktree-ports.env`) pre-date this work and are deliberately uncommitted.
