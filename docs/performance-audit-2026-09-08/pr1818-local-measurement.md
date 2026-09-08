# PR #1818 — local measurement of the multi-parent and ID-list query paths

8 September 2026 · local CouchDB (`luminary-perf-pr1818-20260908`, a replication of
`luminary-local`, 6 356 docs) · anonymous identity.

## Setup

Two API instances against the **same** database, differing only in code:

| Instance | Port | Code |
| -------- | ---- | ---- |
| baseline | 3100 | `1978-api-investigate-performance-issues` @ `afaa5b75` |
| candidate | 3200 | same branch + `git merge 82e528ba` (PR #1818 head) |

The merge keeps the branch's `PERF_TRACE` instrumentation so both instances report
`X-Perf-Trace` (per-phase spans, CouchDB round-trip count, `total_docs_examined`).
Only two files conflicted (`query.controller.ts`, `query.service.ts` imports + the
one `executeFindQuery` → `executeQuery` call site); resolved by keeping both sides.
Neither instance writes to the database (anonymous reads; schema upgrades no-op
because the copy is already at schema 21).

20 samples + 3 warm-ups per shape, baseline/candidate order alternated per sample.

## Results

| Shape | | status | docs | client median | server median | CouchDB `find` calls | rows examined | scan warning |
| ----- | - | ------ | ---- | ------------: | ------------: | -------------------: | ------------: | ------------ |
| **`_id: {$in: […25]}`** (id-list) | baseline | 200 | 25 | 229 ms | 223 ms | 1 | 2 423 | 20/20 |
| | candidate | 200 | 25 | 229 ms | 221 ms | 1 | 2 423 | 20/20 |
| **`parentId: {$in: […40]}` + `sort: publishDate desc`** (what the app sends) | baseline | **500** | 0 | — | — | 1 | — | — |
| | candidate | 200 | 50 | 40 ms | 29 ms | 40 | **131** | 0/20 |
| **`parentId: {$in: […40]}`, no sort** (the catalogue's shape) | baseline | 200 | 50 | 52 ms | 39 ms | 1 | 302 | 20/20 |
| | candidate | 200 | 50 | **3 990 ms** | 3 974 ms | 40 | **96 920** | 0/20 |
| `parentId: <one id>` + sort (control) | baseline | 200 | 3 | 7 ms | 5 ms | 1 | 3 | 0/20 |
| | candidate | 200 | 3 | 7 ms | 5 ms | 1 | 3 | 0/20 |

Result sets (SHA-256 of the sorted `_id` list) are identical between baseline and
candidate for the id-list and single-parent shapes.

## What it means

### ID-list (`_id: {$in}`) — unchanged

PR #1818 does not touch this path. The server-side fan-out (`query.service.ts
executeQuery`) keys on `parentId: {$in}` only; an `_id` list falls straight
through to a single `executeFindQuery`. Byte-for-byte identical timing, round-trip
count, rows examined (2 423 for 25 results — a content-partition scan), and the
same index-rejection warning on both. Production's ~462 ms for this shape is
untouched by this PR.

### Multi-parent `$in` — fixed for the shape the app actually sends

All three call sites (`HomePagePinned.vue`, `PinnedTopics.vue`, `PinnedVideo.vue`)
build the query with `sort: [{ publishDate: "desc" }], limit: 50`. For that shape:

- **baseline returns HTTP 500** locally — CouchDB rejects the pinned
  `content-parentId-publishDate-index` because it can't serve the `$in` + global
  `publishDate` sort ("No index exists for this sort"). Not measured against
  production; production's report only tested the no-sort variant.
- **candidate splits it into 40 per-parent equality seeks** on
  `content-parentId-publishDate-index`, merges, re-sorts, and limits server-side.
  131 rows examined for the 40 parents (≈ 3 per parent — a real index seek), no
  scan warning, ~30 ms of server time. The 40 `find` calls are visible in the
  trace and run at `fanoutConcurrency` (default 20).

This is the real improvement: an unservable / scanning shape becomes 40 bounded
index seeks.

### Multi-parent `$in` without a sort — regression

The catalogue's `hybrid-parentId-fanout-overflow` shape (the one measured at
427 ms against production) carries **no sort**. Against the candidate it is far
worse, not better:

- The server fans out to 40 sub-queries, each pinned to
  `content-parentId-publishDate-index` but **with no sort** — so the partial index
  will not engage and each sub-query full-scans the content partition
  (2 423 rows × 40 = 96 920 examined, ~4 s locally).
- Baseline serves the same no-sort shape from a single query in ~50 ms locally
  (302 examined) — on production this is the 427 ms scan.

`executeQuery` spreads the incoming query into each sub-query and overrides only
`selector` + `use_index`; it does **not** synthesize `publishDate desc` the way the
client's own `fanOut` helper does (`queryIntrospection.ts`, "a scalar equality + a
`publishDate` sort is what makes it seek instead of scan"). The PR's
`query.service.spec.ts` fan-out tests all pass a `publishDate` sort, so this case
is uncovered.

**Recommendation for the PR:** in `executeQuery`, either synthesize
`sort: [{ publishDate: "desc" }]` for each per-parent sub-query when the incoming
query has none (mirroring the client helper), or skip the fan-out and fall back to
the single query when there is no sort. Otherwise any multi-parent content `$in`
that reaches `/query` without a sort turns one scan into N.

## Reproduce

- Comparison data: `pr1818-comparison.json` (in this folder).
- Runner: `pr1818-replay.cjs` — starts from a `{type:content, parentType:post}`
  sample of 200 (mirrors `scripts/perf/lib/context.ts`), derives the 25-id and
  40-parent slices, alternates baseline/candidate.
- Bring the two instances up with
  `PERF_TRACE=true PORT=<p> DB_DATABASE=luminary-perf-pr1818-20260908 AUTH_ALLOW_INSECURE_PROVIDER_DOMAIN=true node dist/src/main`
  from each package's built `dist/`.
