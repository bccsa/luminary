# API performance audit
Run 2026-09-18T15:38:46.292Z against http://localhost:3000 (database `luminary-perf-60k`).

Identity: **anonymous**. Samples per request: 15 (after 3 warm-up). Suites: indexes, fts.

> **Coverage note.** This run used the anonymous identity, whose groups come from a cached lookup — so the auth phase here is close to free. The authenticated path does considerably more per request (provider lookup, JWKS verification, up to three user lookups and a `lastLogin` write). Re-run with `--token`/`--provider` to measure it.

## Corpus
| Doc type | Count |
| :--- | ---: |
| content | 60000 |
| post | 20000 |
| tag | 50 |
| language | 3 |
| group | 5 |
| user | 0 |
| redirect | 0 |
| deleteCmd | 0 |

Database file size: **322.66 MB**.

## Findings
### 🟠 Medium — 10 deployed index(es) with no code reference
*index* — `email-type-index` (180.3 KB), `externalUserId-type-index` (132.3 KB), `parentType-status-expiryDate-language-index` (172.3 KB), `slug-id-index` (5.39 MB), `sync-content-deleteCmd-index` (216.3 KB), `sync-post-content-index` (3.39 MB), `sync-user-deleteCmd-index` (160.3 KB), `sync-user-index` (124.3 KB), `updatedTimeUtc-type-memberOf-index` (7.81 MB), `userId-type-index` (148.3 KB). Every index is updated on every matching document write, so one that is genuinely unused is a permanent write-throughput cost. Confirm before removing: CouchDB can still choose an index automatically for a query that does not pin it by name.

### 🟠 Medium — Search hits the candidate-row budget: `fts-common`
*fts* — 83416 candidate rows scanned, 29751 survived filtering, top-K 150, 1040.16 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Slow search: `fts-common` at 1040.16 ms
*fts* — 5 trigrams (3 kept) → 83416 candidate rows → 29751 survivors → 2 view call(s), 992.97 ms in CouchDB.

### 🟠 Medium — Search hits the candidate-row budget: `fts-rare`
*fts* — 67173 candidate rows scanned, 22391 survived filtering, top-K 150, 803.61 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Slow search: `fts-rare` at 803.61 ms
*fts* — 5 trigrams (3 kept) → 67173 candidate rows → 22391 survivors → 2 view call(s), 770.58 ms in CouchDB.

### 🟠 Medium — Search hits the candidate-row budget: `fts-language`
*fts* — 83416 candidate rows scanned, 10221 survived filtering, top-K 150, 1016.36 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Slow search: `fts-language` at 1016.36 ms
*fts* — 5 trigrams (3 kept) → 83416 candidate rows → 10221 survivors → 2 view call(s), 988.26 ms in CouchDB.

### 🟠 Medium — Search hits the candidate-row budget: `fts-deep-offset`
*fts* — 83416 candidate rows scanned, 29751 survived filtering, top-K 450, 1079.99 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Slow search: `fts-deep-offset` at 1079.99 ms
*fts* — 5 trigrams (3 kept) → 83416 candidate rows → 29751 survivors → 2 view call(s), 1020.31 ms in CouchDB.

### 🟠 Medium — Search hits the candidate-row budget: `fts-strict-sorted`
*fts* — 83416 candidate rows scanned, 29751 survived filtering, top-K 0, 1025.36 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Slow search: `fts-strict-sorted` at 1025.36 ms
*fts* — 5 trigrams (3 kept) → 83416 candidate rows → 29751 survivors → 2 view call(s), 975.64 ms in CouchDB.

### 🟠 Medium — Search hits the candidate-row budget: `fts-cms`
*fts* — 83416 candidate rows scanned, 29751 survived filtering, top-K 150, 1036.14 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Slow search: `fts-cms` at 1036.14 ms
*fts* — 5 trigrams (3 kept) → 83416 candidate rows → 29751 survivors → 2 view call(s), 986.79 ms in CouchDB.

### 🟠 Medium — Search hits the candidate-row budget: `fts-multiword`
*fts* — 67173 candidate rows scanned, 22391 survived filtering, top-K 150, 818.58 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Slow search: `fts-multiword` at 818.58 ms
*fts* — 10 trigrams (3 kept) → 67173 candidate rows → 22391 survivors → 2 view call(s), 788.73 ms in CouchDB.

### 🟠 Medium — Search hits the candidate-row budget: `fts-long`
*fts* — 67173 candidate rows scanned, 22391 survived filtering, top-K 150, 824.44 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Slow search: `fts-long` at 824.44 ms
*fts* — 10 trigrams (3 kept) → 67173 candidate rows → 22391 survivors → 2 view call(s), 788.93 ms in CouchDB.


## Index inventory
Database update sequence: 80112.

| Index | Deployed | Referenced | Disk | Seq lag | Building |
| :--- | :--- | :--- | ---: | ---: | :--- |
| `content-expiryDate-index` | yes | yes | 188.3 KB | 0 | no |
| `content-parentId-publishDate-index` | yes | yes | 2.29 MB | 0 | no |
| `content-parentPinned-publishDate-index` | yes | yes | 1.73 MB | 0 | no |
| `content-parentTagType-publishDate-index` | yes | yes | 3.62 MB | 0 | no |
| `content-publishDate-index` | yes | yes | 3.48 MB | 0 | no |
| `content-slug-publishDate-index` | yes | yes | 2.45 MB | 0 | no |
| `content-title-index` | yes | yes | 3.06 MB | 0 | no |
| `email-type-index` | yes | **no** | 180.3 KB | 0 | no |
| `externalUserId-type-index` | yes | **no** | 132.3 KB | 0 | no |
| `fts-corpus-stats` | yes | yes | 1.63 MB | 0 | no |
| `fts-trigram-index-redirect` | yes | yes | 192.3 KB | 0 | no |
| `fts-trigram-index-user` | yes | yes | 192.3 KB | 0 | no |
| `fts-trigram-index` | yes | yes | 3578.13 MB | 0 | no |
| `parentId` | yes | yes | 1.74 MB | 0 | no |
| `parentType-status-expiryDate-language-index` | yes | **no** | 172.3 KB | 0 | no |
| `slug-id-index` | yes | **no** | 5.39 MB | 0 | no |
| `slug` | yes | yes | 1.95 MB | 0 | no |
| `sync-authProvider-deleteCmd-index` | yes | yes | 172.3 KB | 0 | no |
| `sync-authProvider-index` | yes | yes | 204.3 KB | 0 | no |
| `sync-content-alwaysOffline-index` | yes | yes | 1.15 MB | 0 | no |
| `sync-content-deleteCmd-index` | yes | **no** | 216.3 KB | 0 | no |
| `sync-content-index` | yes | yes | 3.52 MB | 0 | no |
| `sync-defaultAffinity-deleteCmd-index` | yes | yes | 180.3 KB | 0 | no |
| `sync-defaultAffinity-index` | yes | yes | 216.3 KB | 0 | no |
| `sync-group-deleteCmd-index` | yes | yes | 172.3 KB | 0 | no |
| `sync-group-index` | yes | yes | 192.3 KB | 0 | no |
| `sync-language-deleteCmd-index` | yes | yes | 124.3 KB | 0 | no |
| `sync-language-index` | yes | yes | 204.3 KB | 0 | no |
| `sync-post-content-index` | yes | **no** | 3.39 MB | 0 | no |
| `sync-post-deleteCmd-index` | yes | yes | 216.3 KB | 0 | no |
| `sync-post-index` | yes | yes | 1.51 MB | 0 | no |
| `sync-redirect-deleteCmd-index` | yes | yes | 160.3 KB | 0 | no |
| `sync-redirect-index` | yes | yes | 168.3 KB | 0 | no |
| `sync-storage-deleteCmd-index` | yes | yes | 160.3 KB | 0 | no |
| `sync-storage-index` | yes | yes | 216.3 KB | 0 | no |
| `sync-tag-content-index` | yes | yes | 180.3 KB | 0 | no |
| `sync-tag-deleteCmd-index` | yes | yes | 172.3 KB | 0 | no |
| `sync-tag-index` | yes | yes | 168.3 KB | 0 | no |
| `sync-user-deleteCmd-index` | yes | **no** | 160.3 KB | 0 | no |
| `sync-user-index` | yes | **no** | 124.3 KB | 0 | no |
| `sync_deprecated` | yes | yes | 3.62 MB | 1 | no |
| `type-index` | yes | yes | 1.45 MB | 0 | no |
| `updatedTimeUtc-type-memberOf-index` | yes | **no** | 7.81 MB | 0 | no |
| `updatedTimeUtc-type-id-index` | yes | yes | 7.89 MB | 1 | no |
| `userId-type-index` | yes | **no** | 148.3 KB | 0 | no |
| `view-user-email-userId` | yes | yes | 192.3 KB | 0 | no |

## Full-text search pipeline
Each search runs trigram lookup → candidate rows → permission/visibility filter → top-K document fetch → BM25. The row counts show which stage the cost sits in.

Timings are per-sample medians; the stage counts come from the last sample, since they depend on the query and the corpus rather than on the sample.

| Search | n | p50 ms | p95 ms | db ms | views | trigrams | kept | cand. rows | survivors | top-K | results |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `fts-common` | 15 | 1040.16 | 1065.39 | 992.97 | 2 | 5 | 3 | 83416 | 29751 | 150 | 20 |
| `fts-rare` | 15 | 803.61 | 850.97 | 770.58 | 2 | 5 | 3 | 67173 | 22391 | 150 | 20 |
| `fts-miss` | 15 | 2.97 | 3.32 | 2.83 | 1 | 7 | 0 | 0 | 0 | 0 | 0 |
| `fts-language` | 15 | 1016.36 | 1072.34 | 988.26 | 2 | 5 | 3 | 83416 | 10221 | 150 | 20 |
| `fts-deep-offset` | 15 | 1079.99 | 1138.02 | 1020.31 | 2 | 5 | 3 | 83416 | 29751 | 450 | 50 |
| `fts-strict-sorted` | 15 | 1025.36 | 1075.98 | 975.64 | 2 | 5 | 3 | 83416 | 29751 | 0 | 20 |
| `fts-cms` | 15 | 1036.14 | 1045.04 | 986.79 | 2 | 5 | 3 | 83416 | 29751 | 150 | 20 |
| `fts-multiword` | 15 | 818.58 | 888.33 | 788.73 | 2 | 10 | 3 | 67173 | 22391 | 150 | 20 |
| `fts-long` | 15 | 824.44 | 885.24 | 788.93 | 2 | 10 | 3 | 67173 | 22391 | 150 | 20 |
