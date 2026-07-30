# Luminary Web/SSG Tier — Standup

A short tour of the web tier: what problem it solves, and the reasoning behind the key
choices. `search` · `link previews` · `AI citation` · `static HTML` · `incremental
rebuilds` · `R2 + CDN purge` · `restart-safe`.

## The problem: great content nobody could find

Luminary is an offline-first app — it loads its content after JavaScript boots up and
syncs. That's wonderful for users, but terrible for anyone who isn't running our code.

- **What crawlers saw:** an empty page. No text, no titles, no images — because search
  engines and link-preview bots don't run our app. They just see a blank shell.
- **The real cost:** no Google indexing. No rich previews when someone shares a link in
  Slack, iMessage, or social. The content might as well not exist outside the app.

**Why now:** we want Luminary's public content to be discoverable on the open web —
without changing how the native app works.

## The problem, part two: crawlable isn't the same as citable

Being indexable gets us into Google. But a growing share of how people find content now
goes through AI answer engines — ChatGPT, Perplexity, Google's AI Overviews, Claude —
that read a page once and decide whether to summarize it with a citation, or skip it
entirely.

- **What these systems actually read:** most AI crawlers fetch raw HTML once, with no JS
  execution — much like a classic search bot. A blank client-side shell is exactly as
  invisible to them as it is to Googlebot, so the same prerendered mirror that fixes
  search is the prerequisite here too.
- **What makes them cite you, specifically:** being fetchable isn't being *citable*.
  Machine-readable authorship, organization identity, publish dates, and topical context
  all factor into whether an answer engine treats a page as an attributable source — or
  just a page it read and quietly summarized.

## The approach: bake the public pages ahead of time

Instead of making crawlers run our app, we pre-render the public pages to plain HTML at
build time. Then we keep them fresh with small, targeted rebuilds.

- **Only the public stuff.** Private and group-scoped content is never baked into HTML —
  it still syncs live to logged-in users. Prerendering it would mean either leaking it or
  bloating every page. *Why:* a clean line between "everyone can see this" and "only you
  can" — the build only ever touches what's public.
- **One app, not two.** After the page loads, the web build runs the exact same data
  layer as the native app. There's no second, web-only codebase to keep in sync. *Why:*
  two runtimes that drift apart is a maintenance trap. One code path means a fix in one
  place is a fix everywhere.

## Design choice: one content seam

Every page reads its data through a single composable. At build time it fetches from the
server; in the browser it uses the same local-first path as native.

It's tempting to branch the code per target — "if this is the web build, do X". We
deliberately didn't. The moment you branch, you have two behaviors to test, two truths to
remember, and a slow drift toward "works on web, broken on native" (or vice versa). The
payoff: adding a page or changing a query only happens once. The build and the live app
can't disagree, because they're the same code.

## Design choice: no flash on load

A prerendered page that flashes "loading…" before showing content feels broken. So the
very first paint already has the real content — no spinner, no empty state, no jump.

At build time we stash a tiny cache of the page's data → it rides along inline into the
HTML → before the app boots, the browser reads it, instantly → first paint already shows
real content.

We had an earlier bespoke snapshot layer just for this. We deleted it. A second source of
truth inevitably drifts from the first — two caches that disagree is a worse bug than one
cache. One well-understood cache, shared between build and runtime, means less code and
fewer places for the web and native paths to diverge.

## Design choice: finding every page

To prerender the site, we first have to know every public page that exists. Our earlier
approach paged through results using offset pagination against a search endpoint — fast,
but nondeterministic, and it silently capped the site at a fraction of its real page
count. Nobody noticed for a while.

The new way: keyset pagination — page through by a stable cursor until there's nothing
left. Slower per request, but it drains the whole set and we know when it's done. *Why:*
correctness beats speed here. A build that silently omits most of the site is far worse
than a build that takes a little longer but actually finishes.

## Design choice: the dependency vocabulary

Each prerendered page records a few coarse "I depend on this" tags. When something
changes, we check which pages care — and rebuild only those. The trick is making those
tags automatic.

- **Derived, not hand-wired.** Tags come straight from the data the page actually reads —
  which parent, which tags, which language. We never type a per-page list of keys. *Why:*
  the moment keys are hand-maintained, adding a page or moving a component means
  remembering to update keys — and people forget. A forgotten key = a stale page that
  ships.
- **What we deliberately leave out.** Scheduled publish/unpublish times aren't treated as
  edits — they're a clock event, handled by a separate poll. Status and translation
  changes ride along on the doc's own identity key. *Why:* time-based fields would
  explode the number of keys and still miss the moment a post goes live.

## Design choice: incremental rebuilds

A full rebuild of the whole site is slow. So when something changes, we rebuild only the
pages that actually depend on it. The watcher polls periodically, waits briefly for a
burst of edits to settle, then does one scoped build: poll for changes → debounce →
match changed keys against the page manifest → scoped build + upload + purge.

- **Why merge, not overwrite.** A scoped rebuild only touches some pages — so it *merges*
  its results into the existing manifest rather than replacing it. Throwing away the full
  manifest on a partial rebuild would silently orphan every page we didn't just touch.
- **Why a lock file, not just "don't overlap".** The build writes a marker the moment it
  starts and clears it on finish. The watcher starts *before* the initial full build, so
  edits made during that long build aren't missed — they queue up and flush right after,
  instead of racing a build already in flight.

## Design choice: the gap a watcher can't see

The watcher reacts to writes. But a post scheduled for 9am doesn't get edited at 9am — it
just becomes "live" the moment the clock crosses its publish date. Same for the expiry
date going the other way. A write-triggered watcher structurally cannot see either event.

Alongside the ordinary change poll, two more queries run every cycle: content whose
publish/expiry date fell between the last check and now. This is a separate mechanism,
not a workaround bolted onto the cursor — it's closing a different kind of gap (a clock
crossing, not a document mutation), so it gets its own honest poll. Side effect: this is
also why there's no periodic full-rebuild safety-net cron — this poll already closes the
one real blind spot a write-triggered watcher has.

## Design choice: don't redo the expensive part on restart

Every container restart used to run a full build and a full bucket sync before the
watcher could even start — even though the persisted cursor already lets the watcher
catch up on any drift from downtime on its very first poll. Now: CI stamps the image with
a version → on boot, compare to the version last persisted in storage → on a match,
restore the cursor + sidecars and skip straight to the watcher → on any mismatch, fall
back safely to the full build + sync.

The version is scoped to this service's own path, not the whole monorepo's HEAD — an
unrelated commit elsewhere in the repo shouldn't force a redundant rebuild of a site that
didn't change.

## Design choice: shipping without a foot-gun

- **Bounded concurrency.** Uploads run through a small worker pool instead of firing
  thousands of requests at once or crawling the whole site one file at a time. *Why:*
  fast enough for a full sync, gentle enough not to trip storage rate limits.
- **A delete-fraction guard.** If a full sync's orphan-prune pass would delete more than
  half of what's already in the bucket, it aborts instead of executing. *Why:* a bug in
  local file listing, or a build that silently produced almost nothing, should never be
  able to empty the live bucket.

An incremental sync only ever touches the routes that were just regenerated or removed,
plus the always-refreshed SEO artifacts (`sitemap.xml`, `robots.txt`) — everything else is
left untouched, and only the URLs that actually changed get purged from the CDN.

## Design choice: a deliberate kill switch for test runs

The app always regenerates a permissive `robots.txt` on every build — full or scoped.
There's no app-side way to skip that for a one-off test. A `BLOCK_CRAWLERS` flag (off by
default) has the deployer overwrite `robots.txt` to disallow everything immediately
before every upload, so it can't be silently flipped back to permissive by the very next
incremental rebuild. Only ever meant for a non-production run against an isolated test
bucket and domain — crawl-block isn't index-block, so an isolated, never-linked test
domain is the real protection, not the robots line.

## Design choice: built to be cited, not just crawled

Every article emits structured data at prerender time, derived from the exact same
content document the visible page is built from — so the machine-readable version and
what a reader sees can't drift apart.

- **Article, not just meta tags.** Publisher (Organization + logo), a real image,
  `mainEntityOfPage` binding the article to its canonical URL, word count, and article
  section resolved from that piece's own published tags. A breadcrumb list adds topical
  context beyond the headline; the home page carries `WebSite` + a `SearchAction`.
- **A front door sized for LLM clients.** `llms.txt` is written alongside
  `sitemap.xml`/`robots.txt` on every build — compact enough to sit comfortably in a
  model's context window, pointing at the key entry pages and the sitemap rather than
  trying to enumerate every route itself.
- **Why the AI crawlers are named, not just implied by a wildcard rule.** `robots.txt`
  carries explicit allow rules for the major AI crawlers by name — a blanket wildcard
  doesn't reliably read as an unambiguous "yes" to every one of these crawlers in
  practice.

## Design choice: two repos, on purpose

The app and the deployment live in separate repositories.

- **The app repo** owns rendering: turning content into HTML and the sidecar files that
  describe what changed.
- **The deploy repo** owns shipping: watching for changes, uploading to the CDN, and
  purging cached URLs. It holds the cloud credentials and CDN plumbing.

**Why split:** cloud secrets, CDN config, and infrastructure tooling don't belong in the
app's source tree.

## A few choices worth calling out

- **Poll for changes, don't use the live socket.** The socket saw edits arrive, but the
  page never actually updated — room-scoping and the live-sync layer fought each other.
  Polling reuses the same anonymous read path the build already trusts.
- **Render one page at a time.** Parallel rendering would mix up which page read which
  data — the dependency tracker is a single shared object.
- **Don't bake full article text into the first paint.** It blew up memory — every page
  was carrying every translation's full body. We ship just enough for the first paint;
  the full text loads live.
- **Real links in the navigation.** Web routing and crawlability need genuine anchors,
  not JS click handlers. Only Search stays a button — it opens a modal, not a page.
- **No periodic full-rebuild safety-net cron.** Looks like a missing guardrail at a
  glance — it isn't. The wall-clock poll for publish/expiry crossings already closes the
  one gap a write-triggered watcher structurally can't see.

## How we'd know if it broke

- `GET /health` — liveness. `200` the moment the process is up.
- `GET /ready` — `200` only once the watcher is connected and the initial build (or a
  restart-skip) has finished; `503` otherwise. This is the one a load balancer or deploy
  check should actually gate on.
- `GET /metrics` — a JSON snapshot: build/sync/watcher timestamps, live queue depths, and
  per-category error counts split into build/sync/purge. A stuck queue depth with no
  matching timestamp movement is exactly what a frozen watcher looks like — visible
  without reading logs.

## Where it stands

**Working & verified:** type-checks, scoped rebuilds, and the native build all pass; a
real edit on staging was detected, the right page rebuilt, and the change showed up end
to end; the earlier memory blow-up is root-caused and resolved; scoped sync now uploads
and purges automatically off the watcher's own completion hook; restart-skip, the
delete-fraction guard, and crawler lockdown are all in and covered by tests; full JSON-LD,
`llms.txt`, and named AI-crawler allow rules all landed on the app side; a real
prerendered `404.html` exists in the build.

**Still open:**
- The CDN still shows the storage bucket's own generic "object not found" page for dead
  links — needs a small edge function (or platform custom error pages) in front to
  actually serve our `404.html`.
- MIME-type / gzip handling hasn't been confirmed end-to-end against how the CDN actually
  serves each file type in prod.
- Poll-overlap guard and sequential delete behavior are untested under sustained,
  high-volume change traffic.
- Error classification is a small fixed set (build/sync/purge) — may not cleanly cover
  every real failure mode.
- One clean full build across the full route set against a production-sized dataset is
  still unconfirmed.
- Final browser checks (no flash, language switch, 404, navigation) are user-run.
