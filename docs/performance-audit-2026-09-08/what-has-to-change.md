# Performance audit — what actually has to change

Briefing. Every number below is measured (production A/B or local CouchDB `_explain`
against a copy of `luminary-local`). Detail and raw data live beside this file.

All the slow paths are the **same endpoint**: `POST /query` — used both for sync
batches and for the app's HybridQuery read supplements. Four distinct problems.

---

## 1. Tag sync uses the wrong index — 359 ms → 71 ms

**The change:** one `use_index` string in
[`shared/src/api/sync/syncBatch.ts:74`](../../shared/src/api/sync/syncBatch.ts#L74).
Tag content currently pins `sync-content-index`; it should pin
`sync-tag-content-index`.

```
use_index:
    options.type === Content && options.alwaysOffline ? "sync-content-alwaysOffline-index"
  : options.type === Content && options.subType === Tag ? "sync-tag-content-index"   // ← add this
  : options.type === Content                           ? "sync-content-index"
  : "sync-" + (subType ? subType+"-" : "") + type + "-index"
```

**Why it's slow:** `sync-content-index` is a partial index over *all* content
(posts + tags), keyed by `updatedTimeUtc`. A tag sync walks that whole time range —
mostly post content — and filters `parentType = tag` afterwards. `sync-tag-content-index`
is partial-filtered to `type=content, parentType=tag`, so the same walk only touches
tag rows.

**Evidence:** 15-sample alternating A/B against production — median 358 ms → 71 ms
(5×), identical 100 doc IDs, scan warning gone.

**Why it regressed:** #1645 (18 Jun) replaced the per-subtype sync indexes with one
shared `sync-content-index` for all content. No documented reason; it hurts tags
because CouchDB can't use the index's secondary `parentType` key to filter during a
range scan on the primary key.

**Risk / before shipping:** the A/B only covered the first 100-doc page with no
publishDate cutoff. Re-run with a real cutoff, multi-language filters, and a second
sync page. Leave **post** content on `sync-content-index` — the post-specific index
measured *slower* for initial post sync and still scans on publishDate filtering.

**Validator:** none needed. `sync-tag-content-index` is already a real design doc, so
it's already in the pinnable-index registry; no shared-side sync validator restricts
`use_index`.

---

## 2. ID-list lookup does a full partition scan — 208 ms → 3 ms

**The path:** HybridQuery's "id-diff supplement" — when some content IDs a query
wants aren't in the local cache, it POSTs `_id: { $in: [...missing] }` to fetch them
(`decideContentApiQuery` case 2 in `shared/src/util/HybridQuery/queryIntrospection.ts`).
The code comment says this is *"served by the built-in `_id` index"* — **that is
wrong.**

**What CouchDB actually does** (`_explain`, 25 IDs, local copy):

| selector | index chosen | docs examined | time |
|---|---|---|---|
| `{_id: {$in}}` | `_all_docs` | 6 356 (whole DB) | 250 ms |
| `{type: content, _id: {$in}}` | `type-index` | 2 423 (all content) | 196 ms |
| `_all_docs?keys=[…]` (not Mango) | primary | **25** | **3 ms** |

Mango `_find` **cannot seek the primary index for `_id: {$in}`** — only for `_id`
equality or a plain range. Any pinned index is rejected; it always degrades to a
partition scan.

**The change:** API-side, in `query.service.ts`. Detect a selector that reduces to
`_id: {$in: [...]}` (+ `type`, + injected `memberOf`) and resolve it via
`POST /{db}/_all_docs?include_docs=true` with `keys: [...]`, then apply the
permission / expiry filter in JS — instead of `executeFindQuery`. This is the same
by-key fetch the `/fts` endpoint already does for its top-K. ~60× on this shape.

**Risk:** low. It's a narrow special-case; the permission filter still runs in JS on
the fetched docs (same as the sync/HybridQuery paths do today). Not touched by #1818.

---

## 3. Multi-parent lookup — #1818, with one gap

**The path:** pinned-category feeds (`HomePagePinned`, `PinnedTopics`, `PinnedVideo`)
resolve to `parentId: { $in: [...] }` content queries.

**#1818's fix works** for the shape the app sends (`+ publishDate desc` sort): the
API splits it into one indexed seek per parent, merges/sorts/limits server-side.
Local: a scanning/500-ing query → 40 index seeks, 131 rows examined, ~30 ms.

**The gap:** the server fan-out passes the incoming query's `sort` through
unchanged. A multi-parent `$in` that arrives **without** a sort makes each per-parent
sub-query pin `content-parentId-publishDate-index` with no sort — which the partial
index can't serve — so each one full-scans. Measured: 96 920 rows examined, ~4 s (vs
one 302-row query on `main`).

**The change:** in `query.service.ts` `executeQuery`, synthesize
`sort: [{ publishDate: "desc" }]` for each sub-query when the incoming query has none
(the client's own `fanOut` helper already does exactly this), **or** skip the fan-out
and fall back to the single query when there's no sort.

**Status:** posted as a review on #1818. Nothing to do here beyond that PR.

---

## 4. Initial post-sync payload — 1.15 MB / 100 docs

251 ms, ~42% FTS trigram data + roughly the same again in article text. Brotli is
already on; the query is not scanning. This is **payload weight, not query cost**.

**Options, in order of value:**
- Smaller initial content sync page (e.g. 50) so time-to-first-batch drops. Local
  page-size timing is non-monotonic, so measure per environment; it multiplies
  request count.
- Nothing else without a protocol change — the client needs `fts` and body text
  offline, so they can't be trimmed from sync the way `/fts` trims them.

Lowest priority.

---

## 5. Bigger picture — the auth path (not in this audit's numbers)

This audit ran **anonymous**, whose identity is cached and near-free. Every
**authenticated** REST request re-runs: RS256 verify + 3–4 Mango user lookups + a
`lastLogin` write + accessMap projection. That per-request cost is invisible above
and is almost certainly larger than any single query fix.

**The change:** #1719 — opt-in per-token identity cache (`IdentityCacheService` in
front of `AuthIdentityService.resolveOrDefault`, TTL = min(token exp, configured
TTL), re-derives accessMap live so ACL changes need no invalidation). Ships disabled.

**Recommended:** land #1719 and measure the authenticated path with the local issuer
(`api/scripts/perf/local-issuer.mjs`) to confirm the gain — this audit never did.

---

## 6. Index hygiene (from the index suite)

11 deployed indexes have no `use_index` reference in code — each is rebuilt on every
matching write. Two of them (`sync-tag-content-index`, `sync-post-content-index`) are
"unused" *only because* #1645 stopped pinning them (see §1). After §1:
- `sync-tag-content-index` — back in use, keep.
- `sync-post-content-index` — still unpinned; candidate for deletion (confirm CouchDB
  isn't auto-selecting it first).
- The other 9 (`email-type-index`, `userId-type-index`, `slug-id-index`, …) — audit
  the code path that used to reference each before removing.

---

## Priority order

| # | Change | Effort | Payoff | Where |
|---|---|---|---|---|
| 1 | Tag sync → `sync-tag-content-index` | 1 line + validation | 5× on tag sync | `syncBatch.ts` — new PR |
| 2 | ID-list → `_all_docs?keys` path | small API change | 60× on id-diff supplement | `query.service.ts` — new PR |
| 3 | #1818 no-sort fan-out gap | small | avoids a regression | on #1818 |
| 4 | Land + measure #1719 | review | largest real-world gain | #1719 |
| 5 | Post-sync page size | measure per env | modest | `syncBatch.ts` |
| 6 | Drop truly-unused indexes | audit each | write throughput | design docs |
