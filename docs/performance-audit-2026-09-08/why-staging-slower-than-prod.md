# Why staging/dev run slower than production

Tester's observation: production is faster than staging, and the dev data agrees.
Both staging and dev auto-deploy from `main` (ADR 0003); production is promoted
manually and is on an older build. So the question is what landed on `main` — or
what runs alongside staging/dev — that production doesn't have.

## Did sync / HybridQuery change in the last month?

Not in a way that regresses the query shapes. The expensive scans are older:

- **Tag-sync scan** — `syncBatch` pinning the generic `sync-content-index` for tag
  content: commit `35ee02b2`, **PR #1645, 18 June**. Three months old.
- **Multi-parent / unindexable feed scans** — the `parentId: {$in}` fan-out and the
  `parentTags → parentId:{$in}` feed restructuring: the work ADR 0017 refers to as
  "already optimized (commit `d0916d15`)", also June-era.

Last-month sync/query commits were fixes or **load reductions**:

| commit | date | effect |
| --- | --- | --- |
| `ef22637d` #1954 | Aug 28 | clamps the remote `/query` `limit` to 500 — *less* wire + DB work |
| `1ccb32bd` #1947 | Sep 1 | scopes the RestApi `localChanges` live query — *less* |
| `1c7125b9` #1891 | Aug 25 | fixes auth-provider sync sequencing — neutral |

## What *added* load in the last month

1. **SSG / ISR tier** — `bd35c247` #1686 (Aug 13), `c616e305` #1889/#1890,
   `cb6aeea8` #1936. ADR 0018.
   - A full web build **drains every public route (~1934) via keyset pagination over
     `POST /query` at `QUERY_PAGE_SIZE = 500`** (`app/src/ssg/queryDrain.ts`). Those
     `limit: 500` queries are the single slowest shape in every environment
     (`hybrid-max-limit`: ~690 ms p50, p95 1.5 s).
   - ISR is **wired to poll `/query`** for changes (ADR 0018 decision #6; README
     status: "ISR verified end-to-end: a real changed doc on staging triggered …").
     Production has no such watcher.

2. **Tag-affinity recommendation engine** — `fa8be4e9` #1803 (Aug 17), plus
   `24dd34f0` #1906 and `837899d6` #1964.
   - New synced doc type (`DefaultAffinity`) — one more sync column per client.
   - `useRecommendations` fires `ftsSearch` **+** a HybridQuery on the **home page and
     topic/SingleContent pages**. FTS is the slowest endpoint class (250–600 ms p50,
     p95 to 1.5 s). Every content page now pays a recommendation query it didn't before.
   - Contains a `setInterval`.

3. **Live-publish clock** — `6a7e56a5` #1885 (Aug 13). Every content `"data"` event
   bumps `sessionNow`, which re-keys **every** content HybridQuery feed → each re-runs
   its local read *and its remote `/query` supplement*. The commit message itself
   calls out avoiding a "no-op re-key cascade across content feeds." On an environment
   with steady content churn (see below) this fires repeatedly.

## The SSG replica CouchDB — likely the dominant factor

Staging/dev run a second CouchDB continuously replicating the primary for the ISR
pipeline. Production does not. This is load production never sees:

- **Continuous replication is sustained work on the source** — a permanent `_changes`
  longpoll plus `_bulk_get` reads for every change. Connections and CPU the API now
  competes with.
- **The replica maintains its own copy of every view** (`sync-*`, `content-*`,
  `fts-*`). If it shares a VM with the primary, that indexer runs continuously and
  competes directly with the API's *query-time* view reads. This matches the symptom
  precisely: not just slow medians but **very wide p95 tails** — tag-sync p95 2.2–2.7 s,
  `_id:{$in}` p95 up to 4.7 s on dev — i.e. queries stuck behind indexer/replication
  work, not a slower query plan.
- Replication churn feeds #1885's re-key cascade and any ISR poll, compounding.

This is a hypothesis — the replica + ISR watcher live in the deploy repo, not here —
but it fits the evidence better than any code change on `main`.

## How to confirm

On the staging box during a slow period:

```sh
curl -s $COUCH/_active_tasks | jq '.[] | {type, database, progress, changes_pending}'
```

- `replication` tasks with a large `changes_pending`, or `indexer` tasks that never
  reach 100 % → the replica/indexer is saturating the box.
- `top` / `iostat` — is CouchDB pinned near 100 % CPU or I/O-bound when the API is slow?
- Is the replica CouchDB on the **same VM** as the primary? Co-located is the problem.
- Is replication `continuous: true`? A scheduled/batched pull would be gentler.
- What interval does the ISR watcher poll at, and does it poll the `limit: 500` drain
  or targeted keys?

## What to do regardless

The scans (§1 tag index, §2 id-list) are real and get **much** worse under this
background load — a 450 ms scan on an idle box is a 3 s scan on a saturated one. Land
§1 (app + cms build) and §2 (API) to shrink the blast radius while the infra question
is sorted. Consider moving the SSG replica to its own instance, or replicating to a
read-only node the API doesn't share.
