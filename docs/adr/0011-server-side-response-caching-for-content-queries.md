# 11. Server-side response caching for hard-to-index content queries

Date: 2026-06-15

## Status

Proposed

## Context

The app is offline-first. Clients sync the newest Content within a configured
`publishDate` cutoff window; anything older is fetched on demand from the API via the
`HybridQuery` older-tail supplement (`POST /query`). That supplement is the only way to
surface content older than the device's sync window.

CouchDB Mango can only narrow a query through a single compound index whose fields are a
left-to-right prefix of the selector, with at most one range field, followed by the sort
field. In practice this means a content feed can be served efficiently only as
`[<equality field>, publishDate]` — e.g. `content-parentId-publishDate-index`. It
**cannot** index "the newest content across a *set* of parents/tags, globally sorted by
`publishDate`":

- `parentTags: {$elemMatch: {$in: [...]}}` targets a multi-key (array) index, which
  CouchDB will not use to serve a `publishDate` sort — even for a single-value
  `$elemMatch` (confirmed in production: `No index exists for this sort`).
- `parentId: {$in: [...]}}` + a `publishDate` sort is only fast when fanned out into
  per-parent equality seeks (`planRemoteContentQueries`, capped at `FANOUT_MAX_PARENTS`).
  Beyond the cap, the single `$in` query degrades to a full content-partition scan.

We have already optimized everything that *is* indexable (see commit `d0916d15`):
single- and multi-parent supplements fan out to `content-parentId-publishDate-index`
seeks, and the pinned/featured feeds were restructured from `parentTags` to
`parentId: {$in: parentTaggedDocs}` to ride that fan-out and to index the local Dexie
read.

A residual class remains that is **structurally** unindexable. The clearest example is
the pinned/featured feeds (home / explore / video): they show curated content that can
have been published long before the sync cutoff (so it is *not* local and the API
supplement is required), aggregated across more parents than the fan-out cap. The
supplement therefore scans the whole content partition (~2000 docs examined to return a
handful), and these queries persist in the expensive-query logs even with a warm cache.

Alternatives considered and rejected for these residual cases:

- **Per-feed / per-category fan-out** — only helps when each category individually is
  within the cap (data-dependent), risks a request storm (Σ categories × fan-out), and
  needs a per-feed refactor.
- **Raising `FANOUT_MAX_PARENTS`** — only shifts the wall and increases the concurrent
  POST burst for every fan-out call site (e.g. bookmarks).
- **Local-only feeds** (drop the supplement) — *incorrect*: it hides featured content
  published before the cutoff (the failure that prompted reverting that approach).
- **Server-side denormalization** (e.g. a precomputed "newest content per category"
  field) — heavier; keeps a new derived field in sync for one feed shape.

These residual queries share a profile that makes them ideal cache candidates: **stable**
(editorial cadence), **shared** (every user in a permission group runs the same query),
**expensive to compute but tiny to return**, **staleness-tolerant** (a few seconds late is
fine), and **bursty** (clusters of identical requests per page load).

## Decision

Adopt **server-side response caching** as the strategy for `/query` reads that are
structurally hard to index but stable, shared, and staleness-tolerant — rather than
further per-feed query tuning or data-model denormalization.

Guiding principle: **index what is indexable; cache the residue.** Caching is *not* a
substitute for an index on queries that can be indexed (those should be indexed — no
staleness, no cold-miss cost). It is the tool for the queries CouchDB cannot index.

The implementation, when built, must satisfy three constraints:

1. **Cache at `executeFindQuery`** (`api/src/db/db.service.ts`) — the single path that
   calls `nano`'s `db.find`. That call receives the **fully permission-injected** query
   (`QueryService` is the data-leakage boundary: it injects the user's `memberOf` scope,
   published/expiry filters, and blocks the internal `crypto` type *before*
   `executeFindQuery`). Keying the cache on that post-injection query is therefore
   permission-correct **by construction** — the injected group scope is part of the key.
   Caching upstream of injection (on the raw client query) would serve one user's
   permitted results to another and is forbidden.

2. **Bucket time values in the cache key.** The injected `publishDate: {$lte: now}` /
   `expiryDate: {$gt: now}` clauses carry a fresh `now` timestamp per request; keying on
   them verbatim yields a ~0% hit rate. The key must normalize/bucket `now` to the TTL
   granularity while keeping the value-bearing discriminators (parent/tag id lists,
   permission groups, language) exact. (`api/src/util/selectorFingerprint.ts` already
   normalizes *all* values for the expensive-query logger; that is too coarse to key on
   directly — it would collide distinct id-sets and users — but it is the same machinery
   to adapt.)

3. **Short TTL** (start at ~30–60s). It matches the bursty access pattern (collapsing each
   page-load burst to one scan), tolerates the editorial staleness, and avoids
   event-based invalidation complexity. Move to `_changes`-feed event invalidation only
   if TTL staleness proves insufficient.

Scope: read `/query` only. This **complements**, and does not replace:

- the client-side `HybridQuery` response cache (`cache: true`) — a per-device,
  first-paint localStorage seed (different layer, different purpose); and
- the expensive-query logger + optional per-identity rate limiter (`api/src/ratelimit/`)
  — a server cache reduces the expensive-query volume those observe.

## Consequences

- Unavoidable scans are amortized across users and page loads; one general mechanism
  serves all hard-to-index stable reads, present and future.
- Avoids brittle per-feed refactors and `parentTaggedDocs`-style denormalization for the
  residual feeds.
- The **first** (cold) request per `(key, TTL window)` still scans; only repeats within
  the window are cheap. The featured feeds' high share/repeat rate makes this a good
  trade; a per-user-unique query would not benefit.
- Correctness rests on two things being right: the **post-injection key** (a
  key-construction bug is a cross-tenant data leak) and the **time bucketing** (a bug here
  simply yields no hit-rate benefit). Both warrant focused tests.
- Introduces a cache layer and its memory; results are stale by up to the TTL.
- **Not** appropriate for per-user-unique queries (low hit rate), freshness-critical
  reads, or very large result sets — those should not be routed through this cache.
- Until this is built, the pinned/featured feeds remain **correct but scan on miss**
  (~400–700 ms, returning a few docs). The indexable cases are already optimized
  (`d0916d15`); this ADR records the chosen resolution for the rest.
