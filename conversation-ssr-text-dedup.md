# Conversation: cutting duplicate article-text weight from SingleContent's SSR output

## User request

Started from: "For `SingleContent.vue`: setting of localStorage items should be
excluded in the SSR rendered version. On hydration the hydrated code should
handle this. It is currently included as a separate script in the SSR rendered
page." Refined over the conversation into: cut duplicate payload weight by
reusing what's already sitting in the DOM, rather than relying on Cloudflare's
transport compression to paper over the duplication.

## What the "separate script" actually is

`SingleContent.vue`'s content/translations/tags queries use `useContentQuery({
cache: true, cacheId: props.slug })`. During the Node prerender, the query
result is written to `localStorage` (`writeResponseCache`, keyed `hqcache:*`).
`vite.config.web.ts`'s `onPageRendered` hook then reads every `hqcache:*` entry
and inlines it as a classic `<script>(function(c){...localStorage.setItem...})
(...)</script>` before `</head>`. This is deliberate, documented
"no-flash hydration": the script runs during HTML parse, before the ES module
boots, so `useContentQuery`'s cache seed is already in `localStorage` by the
time the client's `HybridQuery` instance is constructed — the query paints
synchronously on first render instead of waiting on Dexie/the API.

This is not something to rip out — removing it would reintroduce the flash it
was built to prevent.

## The actual problem: duplicate bytes, not the mechanism

The seeded content doc includes `text` (the full article HTML body) — the same
string is *also* sitting in the page's rendered `<div v-html="text">`. So a long
article ships twice: once as real HTML, once JSON-escaped inside the inline
script.

Two ideas were ruled out:

- **Hashing/pre-compressing the payload before embedding.** Cloudflare already
  Brotli/gzip-compresses the whole response, and a literal duplicate string
  compresses extremely well on its own. Pre-compressing our own copy (e.g.
  gzip + base64 into the script) would be counterproductive: base64 adds ~33%
  overhead, and already-compressed bytes resist further compression — a
  double-compression anti-pattern.
- **Hash-verifying DOM-recovered HTML.** Comparing a hash of the original
  `text` string to a hash of `element.innerHTML` after the browser parses it
  is unreliable — browsers re-serialize parsed HTML (quote style, attribute
  order, self-closing tags), so byte-identical hashes aren't guaranteed even
  when the content is functionally identical. Trusting the DOM directly
  (it was rendered from this exact `text` in this exact build) avoids that
  false-mismatch risk.

Also considered and mostly set aside: title/summary/author/publishDate/image
are *also* duplicated (rendered DOM text, the cache entry, and again in the
`articleJsonLd`/`breadcrumbJsonLd` `<script type="application/ld+json">`
blocks). Investigation showed only `title` and `summary` are safely,
byte-exactly recoverable from the DOM (`.textContent` on a plain
interpolation, no HTML re-serialization risk) — `author`'s rendered text has a
hardcoded "By " prefix mixed in, `publishDate` is rendered as a
locale-formatted string (the original epoch-ms isn't reconstructable from it),
and `parentImageData` is a structured multi-file object that a single
`<img src>` can't losslessly reconstruct. Given the small payoff relative to
the wiring cost, this was deprioritized in favor of `text` alone — the one
field big enough to matter.

## The design: split write-side stripping from client-side reuse

The response-cache write path is shared between two writers that must NOT be
treated the same:

1. **SSR prerender** (`useContentQuery.ts`'s `onServerPrefetch` branch) — the
   page HTML always has the matching DOM node, so `text` can safely be
   omitted from *this* write.
2. **The client's own `HybridQuery` instance**, which re-writes the cache
   every time the live query settles (so the *next* visit paints fast). A
   plain client-side navigation (SPA route change, browser back/forward) has
   no pre-rendered DOM to recover `text` from — stripping it there would trade
   the SSR-hydration flash for a revisit flash.

So a new `ssrCacheStripFields` option was added to `useContentQuery`, applied
**only** to the SSR write, distinct from the existing `cacheStripFields`
(which affects both writers and stays reserved for fields — like
`translationsArr`'s `text` — that are fine to lose on every write because nothing
ever needs to recover them from the DOM).

On the client, a pure helper (`recoverSsrArticleText`, in
`src/util/ssrTextRecovery.ts`) checks: does the seeded doc lack `text`? If so,
read it back from a `[data-ssr-article-text]` marker added to the rendered
article `<div>`, and feed the merged doc into `SingleContent.vue`'s existing
`contentOverride` ref (already used for the language-switch-override case).
This runs as **plain synchronous setup-time code**, not inside a watcher —
`useContentQuery`'s cache seed is applied synchronously inside the
`HybridQuery` constructor (an `immediate: true` Vue watch fires synchronously),
so by the time `useContentQuery(...)` returns, the override can be applied
before the component's first render/hydration tick. This matters: `v-html`
must match the server output at the very first client render, or Vue's
hydration-mismatch detection (explicitly turned on for this build via
`__VUE_PROD_HYDRATION_MISMATCH_DETAILS__`) would fire.

## What changed

- `app/src/util/ssrTextRecovery.ts` (new) — `recoverSsrArticleText(doc,
  querySelector)`: no-op if `text` is already present (warm client cache) or
  no matching DOM node exists; otherwise merges the node's `innerHTML` into a
  copy of `doc`. Pure function, unit-tested in isolation
  (`ssrTextRecovery.spec.ts`) rather than through a full SSR/hydration
  simulation (no existing test infra in this repo stubs `import.meta.env.SSR`
  for the true/SSR branch — that path is validated by the real `build:web`
  pipeline instead).
- `app/src/composables/useContentQuery.ts` — new `ssrCacheStripFields` option,
  destructured separately from `cacheStripFields` so it never leaks into the
  options object passed to the client-side `useHybridQuery` call. Two new
  tests assert the non-leak.
- `app/src/pages/SingleContent/SingleContent.vue` — `contentArr`'s query now
  passes `ssrCacheStripFields: ["text"]`; the article `<div>` gets
  `data-ssr-article-text`; a one-time client-only block calls
  `recoverSsrArticleText` right after `contentArr` is constructed and seeds
  `contentOverride` if it returns something.

Net effect: the article body no longer ships twice in a prerendered page's
HTML. Cold hydration recovers it from the DOM with no flash; warm client-side
revisits are unaffected (their cache writes were never stripped).

## Commits

- `refactor(app): rename isWeb/IS_WEB to isSSG/IS_SSG for consistent naming` —
  unrelated naming cleanup the user had made locally, committed separately.
- `perf(app): recover SingleContent's article text from the DOM instead of
  duplicating it in the SSR cache seed` — this change.
