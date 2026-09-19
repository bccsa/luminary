# API performance audit
Run 2026-09-18T19:57:50.595Z against http://localhost:3000 (database `luminary-perf-60k`).

Identity: **anonymous**. Samples per request: 15 (after 3 warm-up). Suites: fts.

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
### 🟠 Medium — Search hits the candidate-row budget: `fts-common`
*fts* — 23914 candidate rows scanned, 23914 survived filtering, top-K 150, 322.33 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-rare`
*fts* — 22391 candidate rows scanned, 22391 survived filtering, top-K 150, 301.1 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-language`
*fts* — 23914 candidate rows scanned, 8162 survived filtering, top-K 150, 312.99 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-deep-offset`
*fts* — 23914 candidate rows scanned, 23914 survived filtering, top-K 450, 362.7 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-strict-sorted`
*fts* — 23914 candidate rows scanned, 23914 survived filtering, top-K 0, 305.17 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-cms`
*fts* — 23914 candidate rows scanned, 23914 survived filtering, top-K 150, 308.58 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-multiword`
*fts* — 22391 candidate rows scanned, 22391 survived filtering, top-K 150, 296.67 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-long`
*fts* — 22391 candidate rows scanned, 22391 survived filtering, top-K 150, 294.84 ms. Ranking worked from a truncated candidate set.


## Full-text search pipeline
Each search runs trigram lookup → candidate rows → permission/visibility filter → top-K document fetch → BM25. The row counts show which stage the cost sits in.

Timings are per-sample medians; the stage counts come from the last sample, since they depend on the query and the corpus rather than on the sample.

| Search | n | p50 ms | p95 ms | db ms | views | trigrams | kept | cand. rows | survivors | top-K | results |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `fts-common` | 15 | 322.33 | 332.06 | 300.46 | 2 | 5 | 1 | 23914 | 23914 | 150 | 20 |
| `fts-rare` | 15 | 301.1 | 354.68 | 284.23 | 2 | 5 | 1 | 22391 | 22391 | 150 | 20 |
| `fts-miss` | 15 | 3.31 | 3.57 | 3.16 | 1 | 7 | 0 | 0 | 0 | 0 | 0 |
| `fts-language` | 15 | 312.99 | 343.37 | 302.45 | 2 | 5 | 1 | 23914 | 8162 | 150 | 20 |
| `fts-deep-offset` | 15 | 362.7 | 394.53 | 335.6 | 2 | 5 | 1 | 23914 | 23914 | 450 | 50 |
| `fts-strict-sorted` | 15 | 305.17 | 325.99 | 282.39 | 2 | 5 | 1 | 23914 | 23914 | 0 | 20 |
| `fts-cms` | 15 | 308.58 | 312.98 | 293.12 | 2 | 5 | 1 | 23914 | 23914 | 150 | 20 |
| `fts-multiword` | 15 | 296.67 | 312.72 | 280.15 | 2 | 10 | 1 | 22391 | 22391 | 150 | 20 |
| `fts-long` | 15 | 294.84 | 304.55 | 278.43 | 2 | 10 | 1 | 22391 | 22391 | 150 | 20 |
