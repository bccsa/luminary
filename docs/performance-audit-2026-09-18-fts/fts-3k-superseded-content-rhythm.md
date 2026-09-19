# API performance audit
Run 2026-09-18T10:54:05.498Z against http://localhost:3000 (database `luminary-perf-3k`).

Identity: **anonymous**. Samples per request: 15 (after 3 warm-up). Suites: fts.

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
### 🟠 Medium — Search hits the candidate-row budget: `fts-rare`
*fts* — 3672 candidate rows scanned, 1224 survived filtering, top-K 150, 79.94 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-multiword`
*fts* — 3672 candidate rows scanned, 1224 survived filtering, top-K 150, 80.59 ms. Ranking worked from a truncated candidate set.

### 🟠 Medium — Search hits the candidate-row budget: `fts-long`
*fts* — 3672 candidate rows scanned, 1224 survived filtering, top-K 150, 82.29 ms. Ranking worked from a truncated candidate set.


## Full-text search pipeline
Each search runs trigram lookup → candidate rows → permission/visibility filter → top-K document fetch → BM25. The row counts show which stage the cost sits in.

Timings are per-sample medians; the stage counts come from the last sample, since they depend on the query and the corpus rather than on the sample.

| Search | n | p50 ms | p95 ms | db ms | views | trigrams | kept | cand. rows | survivors | top-K | results |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `fts-common` | 15 | 5.76 | 6.1 | 5.58 | 1 | 5 | 0 | 0 | 0 | 0 | 0 |
| `fts-rare` | 15 | 79.94 | 90.34 | 72.1 | 2 | 4 | 3 | 3672 | 1224 | 150 | 20 |
| `fts-miss` | 15 | 2.99 | 3.11 | 2.86 | 1 | 7 | 0 | 0 | 0 | 0 | 0 |
| `fts-language` | 15 | 5.32 | 5.92 | 5.16 | 1 | 5 | 0 | 0 | 0 | 0 | 0 |
| `fts-deep-offset` | 15 | 5.4 | 6.59 | 5.27 | 1 | 5 | 0 | 0 | 0 | 0 | 0 |
| `fts-strict-sorted` | 15 | 6.67 | 7.1 | 5.77 | 1 | 5 | 0 | 0 | 0 | 0 | 0 |
| `fts-cms` | 15 | 6.42 | 6.77 | 5.85 | 1 | 5 | 0 | 0 | 0 | 0 | 0 |
| `fts-multiword` | 15 | 80.59 | 106.19 | 72.17 | 2 | 9 | 3 | 3672 | 1224 | 150 | 20 |
| `fts-long` | 15 | 82.29 | 103.07 | 75.09 | 2 | 9 | 3 | 3672 | 1224 | 150 | 20 |
