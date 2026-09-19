# FTS corpus scaling — 3k / 15k / 60k content documents

18 September 2026 · local API (`http://localhost:3000`) · anonymous identity · branch
`1978-api-investigate-performance-issues` at `a92a5291`.

This audit answers one question the 1 September audit left open (Unknowns §2): **does `/fts`
cost stay proportional as the corpus grows, or does it fall off a cliff?** It seeds three
throwaway databases at 3 000, 15 000 and 60 000 content documents, runs the same pinned
searches against each, and fits the result. It covers `POST /fts` only; `/query` and sync are
Dirk's 8 September audit. No application code, production data or server configuration was
changed. One constant was changed and reverted for a causal probe (below).

## Strongest result: the candidate-row budget never bounds the scan

Changing nothing but the corpus size, the number of trigram-view rows a search reads grows in
lockstep with the number of documents:

| Content docs | `fts-common` candidate rows | p50 | rows read per result |
| ---: | ---: | ---: | ---: |
| 3 000 | 4 184 | 82 ms | 209 : 1 |
| 15 000 | 20 856 | 291 ms | 1 043 : 1 |
| 60 000 | 83 416 | 1 040 ms | 4 171 : 1 |

Across ×20 documents, candidate rows grow ×19.94 and CouchDB time fits a straight line with
no curvature at all:

```
DB ms ≈ 27 + 11.6 µs × candidate rows     (R² = 1.0000, three points)
```

`FTS_CANDIDATE_ROW_BUDGET = 3000` ([ftsSearch.service.ts:94](../../api/src/endpoints/ftsSearch.service.ts#L94))
is meant to cap that scan. Every real search in this series reports `budgetBound` at every
size — nine request shapes out of nine, from 3 000 documents up — and the scan grows
regardless. At 60 000 documents the API reads 83 416 view rows to return 20 results.

**Confidence: confirmed by intervention** (see the causal probe).

## Why: the min-trigram floor

The trigram selection loop
([ftsSearch.service.ts:287-295](../../api/src/endpoints/ftsSearch.service.ts#L287-L295))
sorts the query's trigrams rarest-first and keeps them until the summed document frequency
would exceed the budget — **but only once it already holds `FTS_MIN_TRIGRAMS = 3`**:

```ts
for (const { t, d } of rankedByDf) {
    if (keptTrigrams.length >= FTS_MIN_TRIGRAMS && rowBudget + d > FTS_CANDIDATE_ROW_BUDGET) break;
    keptTrigrams.push(t);
    rowBudget += d;
}
```

The three rarest trigrams are always kept, whatever they cost. The budget only ever limits the
fourth and later. So the scan is at least `df(t1) + df(t2) + df(t3)`, and each of those
frequencies is proportional to the corpus. A constant budget against a quantity that grows
with N is exceeded from about 2 500 documents on and has no effect after that.

The floor exists for a reason: applying the budget first would keep *zero* trigrams once any
single trigram's df passes 3 000 (which happens by 15k here) and return no results. This is
a design gap, not a mistuned constant — see `what-has-to-change.md` §2.

## Causal probe: floor 3 → 1

To confirm the mechanism rather than infer it from the code, `FTS_MIN_TRIGRAMS` was set to
`1` on the 60k database, the suite re-run, and the constant restored
(`git diff` on the service is empty; nothing was committed).

| Search | kept 3→1 | cand. rows (3) | cand. rows (1) | ÷ | p50 (3) | p50 (1) | ÷ | results |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `fts-common` | 3→1 | 83 416 | 23 914 | 3.49 | 1 040 | 322 | 3.23 | 20 |
| `fts-rare` | 3→1 | 67 173 | 22 391 | 3.00 | 804 | 301 | 2.67 | 20 |
| `fts-language` | 3→1 | 83 416 | 23 914 | 3.49 | 1 016 | 313 | 3.25 | 20 |
| `fts-deep-offset` | 3→1 | 83 416 | 23 914 | 3.49 | 1 080 | 363 | 2.98 | 50 |
| `fts-strict-sorted` | 3→1 | 83 416 | 23 914 | 3.49 | 1 025 | 305 | 3.36 | 20 |
| `fts-cms` | 3→1 | 83 416 | 23 914 | 3.49 | 1 036 | 309 | 3.36 | 20 |

Removing the floor divides the scan by 3.5 and the latency by 3.2 on every shape. **The
ordered top-20 for `message` is byte-for-byte identical before and after**
(`fts-top20-before.txt` / `fts-top20-after.txt`, 20 IDs each, `diff` empty). A document that
contains the word contains all three of its trigrams; the two extra trigrams only widen the
candidate set with fuzzy near-misses that never reached the top-20 on this query.

`23 914` is exactly the 60k document frequency of `mes`, the rarest trigram of `message`
(1 196 at 3k, ×20). The probe is **not** the proposed fix — it is the evidence that the floor
is what drives the scan.

## Scaling data

Fifteen timed samples after three warm-ups, per shape, per size. `p50`/`p95` are the API's own
server-side handler time from `X-Perf-Trace`; stage counters come from the last sample (they
are properties of the query and the corpus, not the sample). Search terms pinned to
`message` (frequent) / `habitat` (rare) on every run — see "Audit corrections" for why those.

**Candidate scan**

| Search | cand. rows 3k | 15k | 60k | ×60k/3k | survivors 60k | top-K | results |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `fts-common` | 4 184 | 20 856 | 83 416 | 19.94 | 29 751 | 150 | 20 |
| `fts-rare` | 3 351 | 16 791 | 67 173 | 20.05 | 22 391 | 150 | 20 |
| `fts-language` | 4 184 | 20 856 | 83 416 | 19.94 | 10 221 | 150 | 20 |
| `fts-deep-offset` | 4 184 | 20 856 | 83 416 | 19.94 | 29 751 | 450 | 50 |
| `fts-strict-sorted` | 4 184 | 20 856 | 83 416 | 19.94 | 29 751 | 0 | 20 |
| `fts-cms` | 4 184 | 20 856 | 83 416 | 19.94 | 29 751 | 150 | 20 |
| `fts-multiword` | 3 351 | 16 791 | 67 173 | 20.05 | 22 391 | 150 | 20 |
| `fts-long` | 3 351 | 16 791 | 67 173 | 20.05 | 22 391 | 150 | 20 |
| `fts-miss` | 0 | 0 | 0 | — | 0 | 0 | 0 |

**Latency and where it goes**

| Search | p50 3k | p50 15k | p50 60k | × | p95 60k | db 60k | JS 60k | JS % |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `fts-common` | 82.3 | 290.6 | 1 040.2 | 12.6 | 1 065.4 | 993.0 | 46.4 | 4% |
| `fts-rare` | 71.9 | 220.5 | 803.6 | 11.2 | 851.0 | 770.6 | 32.6 | 4% |
| `fts-language` | 81.5 | 269.2 | 1 016.4 | 12.5 | 1 072.3 | 988.3 | 27.6 | 3% |
| `fts-deep-offset` | 124.7 | 317.6 | 1 080.0 | 8.7 | 1 138.0 | 1 020.3 | 59.0 | 5% |
| `fts-strict-sorted` | 61.2 | 257.8 | 1 025.4 | 16.8 | 1 076.0 | 975.6 | 49.3 | 5% |
| `fts-cms` | 81.0 | 273.5 | 1 036.1 | 12.8 | 1 045.0 | 986.8 | 48.9 | 5% |
| `fts-multiword` | 74.0 | 227.7 | 818.6 | 11.1 | 888.3 | 788.7 | 29.4 | 4% |
| `fts-long` | 74.6 | 227.6 | 824.4 | 11.0 | 885.2 | 788.9 | 35.0 | 4% |
| `fts-miss` | 3.0 | 3.3 | 3.0 | 1.0 | 3.3 | 2.8 | 0.0 | 1% |

Fitted on `fts-common` over the three sizes:

```
DB ms ≈ 27 + 11.6 µs × candidate rows     (R² = 1.0000)
JS ms ≈  7 + 0.47 µs × candidate rows     (R² = 0.9882)
```

`p95 / p50` stays between 1.01 and 1.18 on every measured shape at every size; no point was
re-run.

## What the data says

- **The cost is the view read, not JavaScript.** At 60k, 96 % of handler time is CouchDB
  returning trigram-view rows; 4 % is JS. Per candidate row, CouchDB costs 11.6 µs and JS
  0.47 µs — a 25× gap. The 1 September finding #3 ("search spends more time in JS than in the
  database", 60 % JS) does not reproduce here. Part of that is corpus shape (see limitations),
  but the conclusion stands on its own: even with zero JS, the scan alone costs a second at
  60 000 documents.
- **Every trigram-view row carries eleven metadata fields.**
  [fts-trigram-index.json](../../api/src/db/designDocs/fts-trigram-index.json) emits
  `parentType, status, publishDate, expiryDate, language, memberOf, parentTags, updatedTimeUtc,
  title, author` alongside the weight, per trigram, per document. That is what 11.6 µs per row
  pays for: 83 416 fat rows serialised, transferred and parsed to keep 150.
- **Request shape stops mattering.** At 3k the shapes spread from 61 to 125 ms; at 60k they
  all land between 1 016 and 1 080 ms. The language filter (`fts-language`) keeps a third of
  the survivors (10 221 of 29 751) at the same cost as keeping them all, because it runs in
  JS *after* the scan. Strict mode (`fts-strict-sorted`, no top-K fetch, no BM25) was 25 %
  cheaper at 3k and is indistinguishable at 60k. Whatever the query asks for, it pays for the
  same 83 416 rows first.
- **The pagination lever decays with corpus size.**

  | Content docs | deep-offset − common | relative |
  | ---: | ---: | ---: |
  | 3 000 | +42 ms | +52 % |
  | 15 000 | +27 ms | +9 % |
  | 60 000 | +40 ms | +4 % |

  Fetching 450 documents instead of 150 costs a fixed ~35 ms. The 1 September
  recommendation to "start with the cheapest lever — cap the pagination window" (a 2.6×
  difference on 2 423 real documents) is a small-corpus remedy; on a large corpus the scan
  dwarfs it.
- **The control behaves.** `fts-miss` (a nine-letter string with no trigram in the corpus)
  costs 3 ms at every size: one `fts-corpus-stats` read and an early return.
- **Side finding, for Dirk:** the index suite reports `sync-post-content-index` as deployed but
  referenced by no code. That is a consequence of the 8 September tag-sync fix, which pins
  `sync-tag-content-index` for tags and left posts on the generic index. Not an FTS matter;
  noted for the index-hygiene list.

## Predictions made before each run

Each size was predicted from the previous one before it was measured. This is what separates
the series from a post-hoc fit.

| Run | Quantity | Predicted | Measured |
| :--- | :--- | ---: | ---: |
| 15k | `fts-common` candidate rows | ~20 900 | 20 856 |
| 60k | `fts-common` candidate rows | ~83 700 | 83 416 |
| 60k | `fts-common` p50 | ~1.05 s | 1.040 s |
| 60k | `fts-rare` p50 | ~850 ms | 804 ms |
| probe | `fts-common` candidate rows | ~27 800 | 23 914 |
| probe | `fts-common` p50 | ~350 ms | 322 ms |

The probe's row count came in under the prediction because the prediction used the mean df
of the three kept trigrams; the single kept trigram is the rarest of them (`trigram-df.py`).

## Audit corrections and limitations

**This is a worst-case corpus, and the result must be read that way.** The seeder draws every
word uniformly from a 593-word list, so the whole corpus contains only **1 234 distinct
trigrams** (`trigram-df.py`) and every word appears in roughly the same share of documents.
There is no genuinely rare term to search for. Of the 593 words, 501 have at least three of
their trigrams above the 50 % pruning line and return nothing; the 92 that survive all cost
between 3 351 and 4 184 candidate rows at 3k. The finding is therefore stated as: *for any
query whose three rarest trigrams are common, the scan is linear in corpus size and the
budget does not apply*. On a real corpus that describes short frequent words and multi-word
queries built from them. The 1 September run on 2 423 real documents scanned 1 469 rows for
its common term — 0.61 rows per document against 1.39 here — so the mechanism carries over;
the magnitude depends on the term.

**The first 3k run used different terms and was superseded.** The initial pick, `content`
(frequent) / `rhythm` (rare), was made by reasoning about trigram commonness. `content` turned
out to have all five trigrams above the pruning line (`con`, `ten`, `ent` are in every one of
the 3 000 documents), so seven of the ten request shapes measured a fully-pruned no-op. That
run is kept as `fts-3k-superseded-content-rhythm.md`; the terms were re-chosen from measured
document frequency (`trigram-df.py`: most and least expensive surviving words) and all three
sizes were run with the new pair. Discovery-picked terms would have differed per corpus,
which is why the harness gained `--fts-term` / `--fts-rare-term` first.

**JS cost is under-represented.** Seeded documents are 243 words each. The BM25 re-scoring of
the 150 top-K documents scales with their `fts` array length, so the 4 % JS share here says
nothing about real documents — where the 1 September audit measured 60 %. Both can be true:
JS dominates on a small corpus of long documents, the scan dominates on a large corpus of any
documents.

**Absolute numbers are this laptop's.** API and CouchDB shared one MacBook Air; 11.6 µs per
row is a property of that machine. The linearity, the ratios, the DB/JS split and the
`budgetBound` behaviour are properties of the algorithm and transfer.

**Anonymous identity only**, default groups via the seeder's provider-less
`AutoGroupMappings`; one language kept by default. The authenticated path and CMS scope were
not the question here.

**No fourth size.** A 150k point was planned to locate the cliff. There is no cliff: the
series is linear with R² = 1.0000 over ×20, and a fourth point on the same line would add
nothing. The disk it would have cost (~14.5 GB of view, ~24 GB peak during compaction) was
better spent on the causal probe.

## Reproduce and inspect

Everything needed to re-run or challenge the numbers. Raw harness output is beside this file
(`fts-*.json`, `fts-*.md`, with the 200-document discovery sample stripped from the JSON —
see `EVIDENCE.md`).

| Item | Value |
| :--- | :--- |
| Harness | `api/scripts/perf/` at `a92a5291`; this audit's additions are commits `eed8b21f` (pinned terms), `3df95da5` (fts sampling), `ad5052b1` + `a92a5291` (README procedure) |
| Corpus | `npm run perf:seed -- --db=luminary-perf-{3k,15k,60k} --posts={1000,5000,20000} --languages=3 --tags=50 --groups=5 --recreate` |
| Seeder facts | 684 trigrams per content document at every size; ~62 KB of trigram view per document; 2 051 466 / 10 256 686 / 41 026 204 view rows |
| Views | `fts-trigram-index` and `fts-corpus-stats` built, then **manually compacted** to ≤ 0.2 % dead space on all three databases before any measurement. Fresh builds carried 26 % (3k), 31 % (15k) and 11 % (60k) dead space — the 60k figure is lower only because smoosh started a compaction on one shard *during* the build. Uncompacted views would have put a second, uncontrolled variable into the series |
| Seeder caveat | on 60k the seeder printed `Seeded` while the view was still 25 % built — Node's `fetch` times out after 5 min and the seeder swallows it. Build completion was verified through `_info` (`updater_running: false`, `update_seq` = database's) and `_active_tasks` empty before each run. Documented in the harness README |
| CouchDB | 3.5.1, `q = 2` shards, smoosh on defaults (`ratio_views` 2, `slack_views` 512 MiB), ken background indexing on — both showed up in `_active_tasks` during builds |
| API | `DB_DATABASE=<db> PERF_TRACE=true npm run start` (compiled, not watch mode); NestJS 11 (branch rebased on `main` including #1950); Node v24.14.0 (`.node-version` says 20 — not reconciled) |
| Audit command | `npm run perf:audit -- --db=<db> --suites=indexes,fts --samples=15 --warmup=3 --fts-term=message --fts-rare-term=habitat --out=./perf-reports/fts-<size>` |
| Probe | `FTS_MIN_TRIGRAMS` 3 → 1 in `ftsSearch.service.ts`, `--suites=fts` only, output `fts-60k-min1.*`; result IDs captured with `curl -X POST /fts -d '{"apiVersion":"0.0.0","queryString":"message"}'` before and after; constant restored |
| Nothing else running | no other API, seed or compaction during any measurement; `_active_tasks` checked empty before each |
| Boot-time writes | the API's first start on each fresh database writes a `dbSchema` doc and rewrites the 5 group docs (schema upgrades v19/v20). No content document is touched; view lag stayed 0–4 non-content sequences |
