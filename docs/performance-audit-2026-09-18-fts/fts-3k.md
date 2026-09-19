# API performance audit
Run 2026-09-18T14:36:28.380Z against http://localhost:3000 (database `luminary-perf-3k`).

Identity: **anonymous**. Samples per request: 15 (after 3 warm-up). Suites: indexes, fts.

> **Coverage note.** This run used the anonymous identity, whose groups come from a cached lookup — so the auth phase here is close to free. The authenticated path does considerably more per request (provider lookup, JWKS verification, up to three user lookups and a `lastLogin` write). Re-run with `--token`/`--provider` to measure it.

## Corpus
| Doc type | Count |
| :--- | ---: |
| content | 3000 |
| post | 1000 |
| tag | 50 |
| language | 3 |
| group | 5 |
| user | 0 |
| redirect | 0 |
| deleteCmd | 0 |

Database file size: **16.7 MB**.

## Findings
### 🟠 Medium — 10 deployed index(es) with no code reference
*index* — `email-type-index` (28.3 KB), `externalUserId-type-index` (28.3 KB), `parentType-status-expiryDate-language-index` (28.3 KB), `slug-id-index` (240.3 KB), `sync-content-deleteCmd-index` (28.3 KB), `sync-post-content-index` (160.3 KB), `sync-user-deleteCmd-index` (28.3 KB), `sync-user-index` (28.3 KB), `updatedTimeUtc-type-memberOf-index` (368.3 KB), `userId-type-index` (28.3 KB). Every index is updated on every matching document write, so one that is genuinely unused is a permanent write-throughput cost. Confirm before removing: CouchDB can still choose an index automatically for a query that does not pin it by name.

### 🟠 Medium — Search hits the candidate-row budget: `fts-common`
*fts* — 4184 candidate rows scanned, 1494 survived filtering, top-K 150, 82.26 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-rare`
*fts* — 3351 candidate rows scanned, 1117 survived filtering, top-K 150, 71.9 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-language`
*fts* — 4184 candidate rows scanned, 514 survived filtering, top-K 150, 81.47 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-deep-offset`
*fts* — 4184 candidate rows scanned, 1494 survived filtering, top-K 450, 124.67 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-strict-sorted`
*fts* — 4184 candidate rows scanned, 1494 survived filtering, top-K 0, 61.21 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-cms`
*fts* — 4184 candidate rows scanned, 1494 survived filtering, top-K 150, 80.96 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-multiword`
*fts* — 3351 candidate rows scanned, 1117 survived filtering, top-K 150, 73.98 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-long`
*fts* — 3351 candidate rows scanned, 1117 survived filtering, top-K 150, 74.64 ms. Ranking worked from a truncated candidate set.


## Index inventory
Database update sequence: 4112.

| Index | Deployed | Referenced | Disk | Seq lag | Building |
| :--- | :--- | :--- | ---: | ---: | :--- |
| `content-expiryDate-index` | yes | yes | 32.3 KB | 0 | no |
| `content-parentId-publishDate-index` | yes | yes | 224.3 KB | 0 | no |
| `content-parentPinned-publishDate-index` | yes | yes | 184.3 KB | 0 | no |
| `content-parentTagType-publishDate-index` | yes | yes | 164.3 KB | 0 | no |
| `content-publishDate-index` | yes | yes | 160.3 KB | 0 | no |
| `content-slug-publishDate-index` | yes | yes | 228.3 KB | 0 | no |
| `content-title-index` | yes | yes | 1012.3 KB | 0 | no |
| `email-type-index` | yes | **no** | 28.3 KB | 0 | no |
| `externalUserId-type-index` | yes | **no** | 28.3 KB | 0 | no |
| `fts-corpus-stats` | yes | yes | 152.4 KB | 0 | no |
| `fts-trigram-index-redirect` | yes | yes | 28.3 KB | 0 | no |
| `fts-trigram-index-user` | yes | yes | 28.3 KB | 0 | no |
| `fts-trigram-index` | yes | yes | 177.11 MB | 0 | no |
| `parentId` | yes | yes | 176.3 KB | 0 | no |
| `parentType-status-expiryDate-language-index` | yes | **no** | 28.3 KB | 0 | no |
| `slug-id-index` | yes | **no** | 240.3 KB | 0 | no |
| `slug` | yes | yes | 188.3 KB | 0 | no |
| `sync-authProvider-deleteCmd-index` | yes | yes | 28.3 KB | 0 | no |
| `sync-authProvider-index` | yes | yes | 28.3 KB | 0 | no |
| `sync-content-alwaysOffline-index` | yes | yes | 44.3 KB | 0 | no |
| `sync-content-deleteCmd-index` | yes | **no** | 28.3 KB | 0 | no |
| `sync-content-index` | yes | yes | 160.3 KB | 0 | no |
| `sync-defaultAffinity-deleteCmd-index` | yes | yes | 32.3 KB | 0 | no |
| `sync-defaultAffinity-index` | yes | yes | 28.3 KB | 0 | no |
| `sync-group-deleteCmd-index` | yes | yes | 28.3 KB | 0 | no |
| `sync-group-index` | yes | yes | 28.3 KB | 0 | no |
| `sync-language-deleteCmd-index` | yes | yes | 28.3 KB | 0 | no |
| `sync-language-index` | yes | yes | 24.3 KB | 0 | no |
| `sync-post-content-index` | yes | **no** | 160.3 KB | 0 | no |
| `sync-post-deleteCmd-index` | yes | yes | 28.3 KB | 0 | no |
| `sync-post-index` | yes | yes | 72.3 KB | 0 | no |
| `sync-redirect-deleteCmd-index` | yes | yes | 28.3 KB | 0 | no |
| `sync-redirect-index` | yes | yes | 24.3 KB | 0 | no |
| `sync-storage-deleteCmd-index` | yes | yes | 28.3 KB | 0 | no |
| `sync-storage-index` | yes | yes | 28.3 KB | 0 | no |
| `sync-tag-content-index` | yes | yes | 24.3 KB | 0 | no |
| `sync-tag-deleteCmd-index` | yes | yes | 32.3 KB | 0 | no |
| `sync-tag-index` | yes | yes | 28.3 KB | 0 | no |
| `sync-user-deleteCmd-index` | yes | **no** | 28.3 KB | 0 | no |
| `sync-user-index` | yes | **no** | 28.3 KB | 0 | no |
| `sync_deprecated` | yes | yes | 264.4 KB | 0 | no |
| `type-index` | yes | yes | 176.3 KB | 0 | no |
| `updatedTimeUtc-type-memberOf-index` | yes | **no** | 368.3 KB | 0 | no |
| `updatedTimeUtc-type-id-index` | yes | yes | 372.3 KB | 0 | no |
| `userId-type-index` | yes | **no** | 28.3 KB | 0 | no |
| `view-user-email-userId` | yes | yes | 32.3 KB | 0 | no |

## Full-text search pipeline
Each search runs trigram lookup → candidate rows → permission/visibility filter → top-K document fetch → BM25. The row counts show which stage the cost sits in.

Timings are per-sample medians; the stage counts come from the last sample, since they depend on the query and the corpus rather than on the sample.

| Search | n | p50 ms | p95 ms | db ms | views | trigrams | kept | cand. rows | survivors | top-K | results |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `fts-common` | 15 | 82.26 | 90.62 | 74.21 | 2 | 5 | 3 | 4184 | 1494 | 150 | 20 |
| `fts-rare` | 15 | 71.9 | 97.85 | 65.12 | 2 | 5 | 3 | 3351 | 1117 | 150 | 20 |
| `fts-miss` | 15 | 2.98 | 3.1 | 2.86 | 1 | 7 | 0 | 0 | 0 | 0 | 0 |
| `fts-language` | 15 | 81.47 | 86.7 | 74.59 | 2 | 5 | 3 | 4184 | 514 | 150 | 20 |
| `fts-deep-offset` | 15 | 124.67 | 132.29 | 106.62 | 2 | 5 | 3 | 4184 | 1494 | 450 | 50 |
| `fts-strict-sorted` | 15 | 61.21 | 70.6 | 58.36 | 2 | 5 | 3 | 4184 | 1494 | 0 | 18 |
| `fts-cms` | 15 | 80.96 | 85.43 | 73.92 | 2 | 5 | 3 | 4184 | 1494 | 150 | 20 |
| `fts-multiword` | 15 | 73.98 | 97.11 | 66.84 | 2 | 10 | 3 | 3351 | 1117 | 150 | 20 |
| `fts-long` | 15 | 74.64 | 78.01 | 67.81 | 2 | 10 | 3 | 3351 | 1117 | 150 | 20 |
