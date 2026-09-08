# Deployed-environment TTFB — production + staging, 8 Sept 2026

Anonymous, sequential, from a single client. `ttfb` = request → response headers;
neither deployed API runs `X-Perf-Trace`, so there's no server phase breakdown — but
TTFB is measurable, and for these shapes the body is small enough that **TTFB ≈ the
API waiting on CouchDB**.

- Production `api.app.bcc.africa` — `prod-run-2026-09-08T12-05.md`, `prod-focused.cjs`
- Staging `api.staging.app.bcc.africa` — `staging-run-2026-09-08T12-12.md`, `staging-focused.cjs`

Staging and production auto-deploy from the same `main` (ADR 0003) and share the data
volume, so the scan costs match. Once this branch merges, **staging is where to
re-run and watch the scans collapse**.

## The floor

`GET /protected` (auth guard, no query): **13 ms TTFB**. Rejected queries (bad
`use_index`, over-limit): 13–19 ms. That's network RTT + TLS + validation. Every
number below is that floor plus CouchDB.

## Latency by shape

| Request | TTFB p50 | client p50 | p95 | body | verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| empty incremental sync | 18–20 ms | 20 ms | 27 ms | 56 B | fine |
| `hybrid-by-slug` | 22 ms | 22 ms | 24 ms | 14 KB | fine |
| `hybrid-by-parentId` (1 parent) | 26 ms | 27 ms | 40 ms | 41 KB | fine |
| `hybrid-pinned` | 58 ms | 59 ms | **257 ms** | 3 KB | unstable tail |
| `sync-content-tag-first` — generic index | **450 ms** | 450 ms | **2 219 ms** | 13 KB | 🔴 scan (§1) |
| `sync-content-tag-first` — tag index | **107 ms** | 108 ms | 461 ms | 13 KB | ✅ §1 fix |
| `hybrid-by-tagType` | 106 ms | 108 ms | 127 ms | 26 KB | slow-ish |
| `hybrid-parentId-fanout-overflow` | 127 ms | 183 ms | **381 ms** | 500 KB | 🔴 scan (#1818) |
| `hybrid-by-id-list` `_id:{$in}`×25 | **412–490 ms** | 432 ms | **1 900 ms** | 256 KB | 🔴 scan (§2) |
| `sync-content-post-first` | 197 ms | 300 ms | 329 ms | 1.09 MB | payload (§4) |
| `hybrid-max-limit` ×500 (synthetic) | 435 ms | 688 ms | **1 579 ms** | 2.19 MB | ceiling probe |
| `fts-common` / `fts-rare` / `fts-*` | 250–600 ms | " | up to **1 545 ms** | ~130 KB | 🔴 not in this audit's fixes |

## What it says

**CouchDB is the whole story.** For every slow shape the body is ≤ 256 KB → transfer
is 15–60 ms. The 100–490 ms of TTFB is the API blocked on a CouchDB `_find`. There is
no API-layer overhead to chase (auth 13 ms floor, validation single-digit).

**Scans cost ~5–10× more here than on a local copy** — the production content
partition is bigger, so a partition scan walks more rows:

| | local replica | production |
| --- | ---: | ---: |
| tag sync, generic index | 142 ms | 450 ms |
| `_id:{$in}` scan | 229 ms | ~490 ms |

**The p95 tail is where it hurts.** Scan queries have unstable latency under real
load + view maintenance: tag-sync p95 **2.2 s**, id-list p95 **1.9 s**, fts p95
**1.5 s**, max-limit p95 **1.6 s**. These are the "app froze" moments. Removing the
scan removes the tail — §1 A/B: p95 **2 219 ms → 461 ms**.

**The fixes, measured against production data:**

- **§1 tag index** — re-confirmed by A/B on current production: **450 → 107 ms**
  (4.2×), p95 2 219 → 461 ms, identical result set, scan warning gone. Client-side
  `use_index` change; production already has the index.
- **§2 id-list fan-out** — not deployable to test (server-side, not on prod), but the
  target is unambiguous: ~490 ms TTFB, scan warning, 256 KB body → the entire cost is
  the scan. Local with the fix: 11 ms.
- **§3 / #1818 multi-parent** — the sorted `parentId:{$in}` shape the app's pinned
  feeds actually send returns **HTTP 500** on production (`No index exists for this
  sort`), same as local. The unsorted variant scans (127 ms + 60 ms transfer). Either
  the client stays under the 25-parent fan-out cap in practice, or many-category
  pinned feeds are silently failing.

**Outside this audit's scope, but the numbers demand a mention:**

- **FTS**: every real search is 250–600 ms TTFB, p95 to 1.5 s. Larger than any single
  query fix. Its own workstream.
- **Post-sync payload**: 197 ms TTFB + 103 ms transfer for 1 MB. Here the transfer
  half is real (unlike local). §4.
- **Auth**: this run is anonymous (13 ms floor). A logged-in request adds provider +
  JWKS + user lookups + `lastLogin` write on top — #1719.

## Staging vs production

Same code, same data volume. TTFB p50:

| Shape | production | staging | note |
| --- | ---: | ---: | --- |
| `protected` (floor) | 13 ms | 12 ms | same network path |
| slug lookup | 22 ms | 40 ms | staging colder |
| single-parent | 26 ms | 45 ms | staging colder |
| `hybrid-pinned` | 58 ms (p95 257) | 18 ms | prod view lag during the run |
| `hybrid-by-tagType` | 106 ms | 37 ms | prod view lag |
| **tag sync — generic index** | **450 ms** | **447 ms** | 🔴 identical scan |
| tag sync — tag index | 107 ms | 129 ms | ✅ §1, both ~3.5–4× |
| **`_id:{$in}` scan** | **~490 ms** | **~430 ms** | 🔴 identical scan |
| multi-parent `$in` unsorted | 127 ms | 312 ms | 🔴 scan, both |
| multi-parent `$in` **sorted** | **HTTP 500** | **HTTP 500** | 🔴 broken on both |
| post sync ×100 | 197 + 103 ms | 202 + 83 ms | same |
| FTS (various) | 276–592 ms | 254–801 ms | 🔴 slow + noisy on both |

**The scan costs are the same on both** — they're driven by data volume and query
shape, not environment or load. The environment-sensitive numbers (indexed queries,
FTS, view-index freshness) bounce around but aren't the problem. §1 holds on staging:
**447 → 129 ms**, p95 1 779 → 501, identical result set. The sorted multi-parent
500 reproduces on staging too — it's a live defect in the deployed code, not a
production-only quirk.
