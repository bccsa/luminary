# Production TTFB — `api.app.bcc.africa`, 8 Sept 2026

Anonymous, sequential, from a single client. `ttfb` = request → response headers;
production has no `X-Perf-Trace`, so there's no server phase breakdown — but TTFB is
measurable, and for these shapes the body is small enough that **TTFB ≈ the API
waiting on CouchDB**. Full run: `prod-run-2026-09-08T12-05.md`. Focused A/B:
`prod-focused.cjs`.

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
