# API performance audit
Run 2026-09-18T14:50:14.875Z against http://localhost:3000 (database `luminary-perf-15k`).

Identity: **anonymous**. Samples per request: 15 (after 3 warm-up). Suites: indexes, fts.

> **Coverage note.** This run used the anonymous identity, whose groups come from a cached lookup — so the auth phase here is close to free. The authenticated path does considerably more per request (provider lookup, JWKS verification, up to three user lookups and a `lastLogin` write). Re-run with `--token`/`--provider` to measure it.

## Corpus
| Doc type | Count |
| :--- | ---: |
| content | 15000 |
| post | 5000 |
| tag | 50 |
| language | 3 |
| group | 5 |
| user | 0 |
| redirect | 0 |
| deleteCmd | 0 |

Database file size: **81.09 MB**.

## Findings
### 🟠 Medium — 10 deployed index(es) with no code reference
*index* — `email-type-index` (48.3 KB), `externalUserId-type-index` (48.3 KB), `parentType-status-expiryDate-language-index` (48.3 KB), `slug-id-index` (1.22 MB), `sync-content-deleteCmd-index` (36.3 KB), `sync-post-content-index` (780.3 KB), `sync-user-deleteCmd-index` (48.3 KB), `sync-user-index` (48.3 KB), `updatedTimeUtc-type-memberOf-index` (1.82 MB), `userId-type-index` (48.3 KB). Every index is updated on every matching document write, so one that is genuinely unused is a permanent write-throughput cost. Confirm before removing: CouchDB can still choose an index automatically for a query that does not pin it by name.

### 🟠 Medium — Search hits the candidate-row budget: `fts-common`
*fts* — 20856 candidate rows scanned, 7440 survived filtering, top-K 150, 290.62 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-rare`
*fts* — 16791 candidate rows scanned, 5597 survived filtering, top-K 150, 220.54 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-language`
*fts* — 20856 candidate rows scanned, 2557 survived filtering, top-K 150, 269.23 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-deep-offset`
*fts* — 20856 candidate rows scanned, 7440 survived filtering, top-K 450, 317.6 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-strict-sorted`
*fts* — 20856 candidate rows scanned, 7440 survived filtering, top-K 0, 257.83 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-cms`
*fts* — 20856 candidate rows scanned, 7440 survived filtering, top-K 150, 273.52 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-multiword`
*fts* — 16791 candidate rows scanned, 5597 survived filtering, top-K 150, 227.73 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-long`
*fts* — 16791 candidate rows scanned, 5597 survived filtering, top-K 150, 227.55 ms. Ranking worked from a truncated candidate set.


## Index inventory
Database update sequence: 20112.

| Index | Deployed | Referenced | Disk | Seq lag | Building |
| :--- | :--- | :--- | ---: | ---: | :--- |
| `content-expiryDate-index` | yes | yes | 56.3 KB | 3 | no |
| `content-parentId-publishDate-index` | yes | yes | 1.15 MB | 3 | no |
| `content-parentPinned-publishDate-index` | yes | yes | 1000.3 KB | 5 | no |
| `content-parentTagType-publishDate-index` | yes | yes | 840.3 KB | 3 | no |
| `content-publishDate-index` | yes | yes | 792.3 KB | 3 | no |
| `content-slug-publishDate-index` | yes | yes | 1.2 MB | 3 | no |
| `content-title-index` | yes | yes | 844.3 KB | 3 | no |
| `email-type-index` | yes | **no** | 48.3 KB | 4 | no |
| `externalUserId-type-index` | yes | **no** | 48.3 KB | 4 | no |
| `fts-corpus-stats` | yes | yes | 824.4 KB | 3 | no |
| `fts-trigram-index-redirect` | yes | yes | 48.3 KB | 3 | no |
| `fts-trigram-index-user` | yes | yes | 48.3 KB | 4 | no |
| `fts-trigram-index` | yes | yes | 890.34 MB | 4 | no |
| `parentId` | yes | yes | 928.3 KB | 3 | no |
| `parentType-status-expiryDate-language-index` | yes | **no** | 48.3 KB | 4 | no |
| `slug-id-index` | yes | **no** | 1.22 MB | 3 | no |
| `slug` | yes | yes | 1020.3 KB | 3 | no |
| `sync-authProvider-deleteCmd-index` | yes | yes | 48.3 KB | 3 | no |
| `sync-authProvider-index` | yes | yes | 48.3 KB | 3 | no |
| `sync-content-alwaysOffline-index` | yes | yes | 232.3 KB | 0 | no |
| `sync-content-deleteCmd-index` | yes | **no** | 36.3 KB | 4 | no |
| `sync-content-index` | yes | yes | 812.3 KB | 0 | no |
| `sync-defaultAffinity-deleteCmd-index` | yes | yes | 48.3 KB | 3 | no |
| `sync-defaultAffinity-index` | yes | yes | 48.3 KB | 3 | no |
| `sync-group-deleteCmd-index` | yes | yes | 36.3 KB | 3 | no |
| `sync-group-index` | yes | yes | 52.3 KB | 0 | no |
| `sync-language-deleteCmd-index` | yes | yes | 48.3 KB | 0 | no |
| `sync-language-index` | yes | yes | 40.3 KB | 0 | no |
| `sync-post-content-index` | yes | **no** | 780.3 KB | 3 | no |
| `sync-post-deleteCmd-index` | yes | yes | 52.3 KB | 0 | no |
| `sync-post-index` | yes | yes | 340.3 KB | 0 | no |
| `sync-redirect-deleteCmd-index` | yes | yes | 48.3 KB | 3 | no |
| `sync-redirect-index` | yes | yes | 52.3 KB | 0 | no |
| `sync-storage-deleteCmd-index` | yes | yes | 36.3 KB | 3 | no |
| `sync-storage-index` | yes | yes | 44.3 KB | 3 | no |
| `sync-tag-content-index` | yes | yes | 52.3 KB | 0 | no |
| `sync-tag-deleteCmd-index` | yes | yes | 52.3 KB | 0 | no |
| `sync-tag-index` | yes | yes | 52.3 KB | 0 | no |
| `sync-user-deleteCmd-index` | yes | **no** | 48.3 KB | 4 | no |
| `sync-user-index` | yes | **no** | 48.3 KB | 4 | no |
| `sync_deprecated` | yes | yes | 1.34 MB | 4 | no |
| `type-index` | yes | yes | 1 MB | 0 | no |
| `updatedTimeUtc-type-memberOf-index` | yes | **no** | 1.82 MB | 4 | no |
| `updatedTimeUtc-type-id-index` | yes | yes | 1.84 MB | 4 | no |
| `userId-type-index` | yes | **no** | 48.3 KB | 3 | no |
| `view-user-email-userId` | yes | yes | 48.3 KB | 3 | no |

## Full-text search pipeline
Each search runs trigram lookup → candidate rows → permission/visibility filter → top-K document fetch → BM25. The row counts show which stage the cost sits in.

Timings are per-sample medians; the stage counts come from the last sample, since they depend on the query and the corpus rather than on the sample.

| Search | n | p50 ms | p95 ms | db ms | views | trigrams | kept | cand. rows | survivors | top-K | results |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `fts-common` | 15 | 290.62 | 377.98 | 270.44 | 2 | 5 | 3 | 20856 | 7440 | 150 | 20 |
| `fts-rare` | 15 | 220.54 | 260.69 | 209.33 | 2 | 5 | 3 | 16791 | 5597 | 150 | 20 |
| `fts-miss` | 15 | 3.28 | 3.44 | 3.13 | 1 | 7 | 0 | 0 | 0 | 0 | 0 |
| `fts-language` | 15 | 269.23 | 281.02 | 259.61 | 2 | 5 | 3 | 20856 | 2557 | 150 | 20 |
| `fts-deep-offset` | 15 | 317.6 | 332.85 | 291.71 | 2 | 5 | 3 | 20856 | 7440 | 450 | 50 |
| `fts-strict-sorted` | 15 | 257.83 | 266.21 | 245.77 | 2 | 5 | 3 | 20856 | 7440 | 0 | 20 |
| `fts-cms` | 15 | 273.52 | 280.75 | 261.2 | 2 | 5 | 3 | 20856 | 7440 | 150 | 20 |
| `fts-multiword` | 15 | 227.73 | 235.59 | 216.2 | 2 | 10 | 3 | 16791 | 5597 | 150 | 20 |
| `fts-long` | 15 | 227.55 | 248.83 | 215.74 | 2 | 10 | 3 | 16791 | 5597 | 150 | 20 |
